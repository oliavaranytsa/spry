"""The parser's Lambda handler: authentication, limits, errors and the log line."""

import json
import sys
import types

import pytest

from app.ai import agenda_lambda
from app.ai.agenda import AgendaParseError, ParsedAgenda
from app.auth import InvalidToken
from app.config import Settings

AGENDA = ParsedAgenda(items=[{"topic": "Release plan", "owner": "Olena"}], language="en")


class FakeRateLimit(Exception):
    pass


class FakeAPIError(Exception):
    pass


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    settings = Settings(cognito_user_pool_id="pool", cognito_client_id="client")
    monkeypatch.setattr(agenda_lambda, "get_settings", lambda: settings)

    def verify(token, _settings):
        if token != "good":
            raise InvalidToken("bad")
        return {"sub": "user-1"}

    monkeypatch.setattr(agenda_lambda, "verify_token", verify)
    # The handler imports anthropic only for its error classes.
    fake = types.SimpleNamespace(RateLimitError=FakeRateLimit, APIError=FakeAPIError)
    monkeypatch.setitem(sys.modules, "anthropic", fake)


def _event(body, token="good"):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return {"headers": headers, "body": json.dumps(body), "isBase64Encoded": False}


BODY = {"text": "Sync on Friday: release plan (Olena)", "today": "2026-10-17", "tz": "Europe/Kyiv"}


def _parse_ok(text, today, tz):
    return AGENDA, {"input_tokens": 2000, "output_tokens": 500}


def test_parses_and_logs_one_json_line(monkeypatch, capsys) -> None:
    monkeypatch.setattr(agenda_lambda, "parse_agenda", _parse_ok)
    response = agenda_lambda.handler(_event(BODY), None)
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["agenda"]["items"][0]["owner"] == "Olena"
    assert body["prompt_version"] == "agenda-v1"

    line = json.loads(capsys.readouterr().out.strip())
    assert line["event"] == "agenda_parsed"
    assert line["user"] == "user-1"
    assert line["input_tokens"] == 2000 and line["output_tokens"] == 500
    assert line["cost_usd"] == pytest.approx(0.018)  # Opus: 2000*4/1M + 500*20/1M
    assert "latency_ms" in line


@pytest.mark.parametrize("token", [None, "forged"])
def test_rejects_without_a_valid_token(monkeypatch, token) -> None:
    called = []
    monkeypatch.setattr(agenda_lambda, "parse_agenda", lambda *a: called.append(a))
    response = agenda_lambda.handler(_event(BODY, token=token), None)
    assert response["statusCode"] == 401
    assert called == []  # the model is never called, so it costs nothing


def test_rejects_long_text_before_calling_the_model(monkeypatch) -> None:
    called = []
    monkeypatch.setattr(agenda_lambda, "parse_agenda", lambda *a: called.append(a))
    response = agenda_lambda.handler(_event({**BODY, "text": "x" * 10_001}), None)
    assert response["statusCode"] == 413
    assert called == []


@pytest.mark.parametrize(
    "body",
    [
        {"text": "x"},
        {**BODY, "today": "Friday"},
        {**BODY, "tz": "Mars/Base"},
        {**BODY, "text": " "},
    ],
)
def test_rejects_malformed_requests(body) -> None:
    assert agenda_lambda.handler(_event(body), None)["statusCode"] == 400


def test_no_agenda_is_422(monkeypatch) -> None:
    def fail(*a):
        raise AgendaParseError("no agenda returned (stop_reason=end_turn)")

    monkeypatch.setattr(agenda_lambda, "parse_agenda", fail)
    response = agenda_lambda.handler(_event(BODY), None)
    assert response["statusCode"] == 422
    assert json.loads(response["body"])["code"] == "no_agenda"


def test_throttling_is_429(monkeypatch) -> None:
    def busy(*a):
        raise FakeRateLimit()

    monkeypatch.setattr(agenda_lambda, "parse_agenda", busy)
    assert agenda_lambda.handler(_event(BODY), None)["statusCode"] == 429
