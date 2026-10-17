import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Meeting(Base):
    """A scheduled meeting."""

    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attendee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # The agenda the user saved: {"items": [...], "action_items": [...]}.
    # Empty until someone adds one, by hand or from a pasted text.
    agenda: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    # What the model suggested before the user corrected it, with the model and
    # prompt version: {"agenda": {...}, "model": "...", "prompt_version": "..."}.
    # Null when the agenda was typed by hand. The difference between this and
    # `agenda` is the quality signal of the parser (Lab 6, Step 4).
    ai_suggestion: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
