from fastapi import APIRouter, status
from sqlalchemy import select

from app.db import SessionDep
from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingOut

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("", response_model=list[MeetingOut])
async def list_meetings(session: SessionDep) -> list[Meeting]:
    result = await session.execute(select(Meeting).order_by(Meeting.starts_at.asc()))
    return list(result.scalars().all())


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreate, session: SessionDep) -> Meeting:
    meeting = Meeting(**payload.model_dump())
    session.add(meeting)
    await session.flush()
    await session.refresh(meeting)
    return meeting
