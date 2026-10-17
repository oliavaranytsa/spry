"""Lambda entry point of the agenda parser, behind its own function URL.

The same container image as the API, another command (infra/ai.yml:
ImageConfig.Command). It runs outside the VPC: it needs no database, only
Bedrock and Cognito's public keys, both reached over the internet with no NAT
and no VPC endpoint. It only reads text and answers JSON. Saving the agenda
goes through the main API (PUT /api/meetings/{id}/agenda), never through here.

Request:  POST {"text": "...", "today": "2026-10-17", "tz": "Europe/Kyiv"}
          Authorization: Bearer <Cognito access token>
Response: 200 {"agenda": {...}, "model": "...", "prompt_version": "...", ...}

Every call costs money, so before the model is called:
- no valid Cognito access token     -> 401
- text over 10,000 characters       -> 413
- malformed body, date or time zone -> 400
Then: no agenda in the text -> 422, Bedrock throttling -> 429, Bedrock down -> 502.

One JSON line per parse goes to CloudWatch (event "agenda_parsed"): user,
model, prompt version, tokens, latency and cost in dollars.
"""

import base64
import json
import time
from datetime import date
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.ai.agenda import PROMPT_VERSION, AgendaParseError, cost_usd, parse_agenda
from app.auth import InvalidToken, verify_token
from app.config import get_settings

MAX_TEXT_CHARS = 10_000


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    # CORS headers are added by the function URL (infra/ai.yml), not here.
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _error(status: int, code: str, message: str) -> dict[str, Any]:
    return _response(status, {"error": message, "code": code})


def _log(**fields: Any) -> None:
    # print, not logging: one line of pure JSON, easy to query in Logs Insights.
    print(json.dumps(fields, ensure_ascii=False), flush=True)


def _user(headers: dict[str, str]) -> str:
    """The caller's Cognito sub. Raises InvalidToken for anything else."""
    auth = headers.get("authorization", "")
    scheme, _, token = auth.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise InvalidToken("no bearer token")
    return verify_token(token, get_settings())["sub"]


def _body(event: dict[str, Any]) -> dict[str, Any]:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    body = json.loads(raw)
    if not isinstance(body, dict):
        raise ValueError("the body must be a JSON object")
    return body


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    settings = get_settings()
    if not settings.auth_configured:
        return _error(503, "not_configured", "Sign-in is not configured")

    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    try:
        user = _user(headers)
    except InvalidToken:
        return _error(401, "unauthorized", "Not signed in")

    try:
        body = _body(event)
        text = body["text"]
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text is empty")
        today = date.fromisoformat(body["today"])
        tz = str(body["tz"])
        ZoneInfo(tz)
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError) as e:
        return _error(400, "bad_request", f"Expected text, today and tz: {e}")

    # Checked before the model is called: a long text is a long bill.
    if len(text) > MAX_TEXT_CHARS:
        return _error(413, "too_long", f"The text is longer than {MAX_TEXT_CHARS} characters")

    import anthropic  # here, not at the top: tests run without Bedrock

    model = settings.parser_model
    started = time.monotonic()
    try:
        agenda, usage = parse_agenda(text, today, tz)
    except AgendaParseError as e:
        _log(
            event="agenda_failed",
            user=user,
            model=model,
            prompt_version=PROMPT_VERSION,
            code="no_agenda",
            error=str(e),
        )
        return _error(422, "no_agenda", str(e))
    except anthropic.RateLimitError:
        _log(event="agenda_failed", user=user, model=model, code="busy")
        return _error(429, "busy", "The parser is busy. Try again in a minute.")
    except anthropic.APIError as e:
        _log(event="agenda_failed", user=user, model=model, code="upstream", error=str(e))
        return _error(502, "upstream", "The model is not available right now.")

    latency_ms = int((time.monotonic() - started) * 1000)
    cost = cost_usd(model, usage)
    _log(
        event="agenda_parsed",
        user=user,
        model=model,
        prompt_version=PROMPT_VERSION,
        **usage,
        latency_ms=latency_ms,
        cost_usd=cost,
    )
    return _response(
        200,
        {
            "agenda": agenda.model_dump(mode="json"),
            "model": model,
            "prompt_version": PROMPT_VERSION,
            "usage": usage,
            "latency_ms": latency_ms,
            "cost_usd": cost,
        },
    )
