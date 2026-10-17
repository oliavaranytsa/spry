"""The parser without Bedrock: a fake client plays the model."""

from datetime import date
from types import SimpleNamespace

import pytest

from app.ai import agenda
from app.ai.agenda import AgendaParseError, cost_usd, parse_agenda

GOOD = {
    "title": "Release sync",
    "items": [{"topic": "Release plan", "owner": "Olena", "minutes": 20}],
    "action_items": [{"task": "Send notes", "owner": "Taras", "due": "2026-10-23"}],
    "language": "en",
}


def _message(tool_input=None, stop_reason="tool_use"):
    content = []
    if tool_input is not None:
        content.append(SimpleNamespace(type="tool_use", id="toolu_1", input=tool_input))
    return SimpleNamespace(
        content=content,
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=1000, output_tokens=200),
    )


class FakeClient:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self.replies.pop(0)


@pytest.fixture
def fake(monkeypatch):
    def install(*replies):
        client = FakeClient(*replies)
        monkeypatch.setattr(agenda, "bedrock_client", lambda: client)
        return client

    return install


def test_valid_answer_is_returned_with_usage(fake) -> None:
    client = fake(_message(GOOD))
    parsed, usage = parse_agenda("some text", date(2026, 10, 17), "Europe/Kyiv")
    assert parsed.items[0].owner == "Olena"
    assert parsed.action_items[0].due == date(2026, 10, 23)
    assert usage == {"input_tokens": 1000, "output_tokens": 200}
    # The date, the time zone and the delimited text are all in the prompt.
    prompt = client.calls[0]["messages"][0]["content"]
    assert "Saturday 2026-10-17" in prompt and "Europe/Kyiv" in prompt
    assert "<pasted_text>\nsome text\n</pasted_text>" in prompt


def test_invalid_answer_is_retried_once_with_the_error(fake) -> None:
    bad = {**GOOD, "items": [{"topic": "", "minutes": 9999}]}
    client = fake(_message(bad), _message(GOOD))
    parsed, usage = parse_agenda("x", date(2026, 10, 17), "Europe/Kyiv")
    assert parsed.title == "Release sync"
    assert usage["input_tokens"] == 2000  # both attempts are paid for
    retry = client.calls[1]["messages"][-1]["content"][0]
    assert retry["type"] == "tool_result" and retry["is_error"] is True


def test_invalid_twice_raises(fake) -> None:
    bad = {"items": "not a list"}
    fake(_message(bad), _message(bad))
    with pytest.raises(AgendaParseError, match="invalid agenda twice"):
        parse_agenda("x", date(2026, 10, 17), "Europe/Kyiv")


def test_no_tool_call_raises(fake) -> None:
    fake(_message(None, stop_reason="refusal"))
    with pytest.raises(AgendaParseError, match="refusal"):
        parse_agenda("x", date(2026, 10, 17), "Europe/Kyiv")


def test_cost() -> None:
    usage = {"input_tokens": 2000, "output_tokens": 500}
    assert cost_usd("anthropic.claude-opus-5-5", usage) == pytest.approx(0.018)
    assert cost_usd("anthropic.claude-haiku-5-5", usage) == pytest.approx(0.00045)
    assert cost_usd("unknown", usage) == 0
