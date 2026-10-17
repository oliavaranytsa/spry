"""Meetings: the service layer between the routes and the database.

The routes know HTTP (status codes, request bodies); this module knows the
rules and the queries. Nothing here imports FastAPI.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.meeting import Meeting
from app.schemas.agenda import AgendaSave
from app.schemas.meeting import MeetingCreate


async def list_meetings(session: AsyncSession) -> list[Meeting]:
    result = await session.execute(select(Meeting).order_by(Meeting.starts_at.asc()))
    return list(result.scalars().all())


async def get_meeting(session: AsyncSession, meeting_id: uuid.UUID) -> Meeting | None:
    return await session.get(Meeting, meeting_id)


async def create_meeting(session: AsyncSession, payload: MeetingCreate) -> Meeting:
    meeting = Meeting(**payload.model_dump())
    session.add(meeting)
    await session.flush()
    await session.refresh(meeting)
    return meeting


async def update_meeting(
    session: AsyncSession, meeting: Meeting, payload: MeetingCreate
) -> Meeting:
    """Replace the meeting's own fields. The agenda is left as it is."""
    for field, value in payload.model_dump().items():
        setattr(meeting, field, value)
    await session.flush()
    await session.refresh(meeting)
    return meeting


async def delete_meeting(session: AsyncSession, meeting: Meeting) -> None:
    await session.delete(meeting)
    await session.flush()


async def save_agenda(session: AsyncSession, meeting: Meeting, payload: AgendaSave) -> Meeting:
    """Replace the meeting's agenda, and keep what the model suggested next to it."""
    meeting.agenda = payload.model_dump(mode="json", include={"items", "action_items"})
    meeting.ai_suggestion = (
        payload.ai_suggestion.model_dump(mode="json") if payload.ai_suggestion else None
    )
    await session.flush()
    await session.refresh(meeting)
    return meeting
