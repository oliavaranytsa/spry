import uuid

from fastapi import APIRouter, HTTPException, status

from app.db import SessionDep
from app.models.meeting import Meeting
from app.schemas.agenda import AgendaSave
from app.schemas.meeting import MeetingCreate, MeetingOut
from app.services import meetings as meetings_service

router = APIRouter(prefix="/meetings", tags=["meetings"])


async def _get_or_404(session: SessionDep, meeting_id: uuid.UUID) -> Meeting:
    meeting = await meetings_service.get_meeting(session, meeting_id)
    if meeting is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Meeting not found")
    return meeting


@router.get("", response_model=list[MeetingOut])
async def list_meetings(session: SessionDep) -> list[Meeting]:
    return await meetings_service.list_meetings(session)


@router.post("", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
async def create_meeting(payload: MeetingCreate, session: SessionDep) -> Meeting:
    return await meetings_service.create_meeting(session, payload)


@router.get("/{meeting_id}", response_model=MeetingOut)
async def get_meeting(meeting_id: uuid.UUID, session: SessionDep) -> Meeting:
    return await _get_or_404(session, meeting_id)


@router.put("/{meeting_id}/agenda", response_model=MeetingOut)
async def save_agenda(meeting_id: uuid.UUID, payload: AgendaSave, session: SessionDep) -> Meeting:
    """Save the agenda the user confirmed. The only way an agenda is written."""
    meeting = await _get_or_404(session, meeting_id)
    return await meetings_service.save_agenda(session, meeting, payload)
