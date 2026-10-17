"""What the API accepts as a meeting's agenda.

The same rules apply whoever filled the form: the user typing, or the user
accepting what the parser suggested. The parser never writes; it only
pre-fills the form, and the save comes through here (Lab 6).
"""

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class AgendaItem(BaseModel):
    topic: str = Field(min_length=1, max_length=500)
    owner: str | None = Field(default=None, max_length=255)
    minutes: int | None = Field(default=None, ge=1, le=480)


class ActionItem(BaseModel):
    task: str = Field(min_length=1, max_length=500)
    owner: str | None = Field(default=None, max_length=255)
    due: date | None = None


class Agenda(BaseModel):
    items: list[AgendaItem] = Field(default_factory=list, max_length=50)
    action_items: list[ActionItem] = Field(default_factory=list, max_length=50)


class AiSuggestion(BaseModel):
    """What the parser returned, kept next to what the user saved."""

    agenda: dict[str, Any]
    model: str = Field(min_length=1, max_length=100)
    prompt_version: str = Field(min_length=1, max_length=50)


class AgendaSave(Agenda):
    # Present when the form was pre-filled by the parser; null when typed by hand.
    ai_suggestion: AiSuggestion | None = None
