import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.agenda import Agenda


class MeetingBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    starts_at: datetime
    ends_at: datetime
    attendee_count: int = Field(..., ge=1)

    @model_validator(mode="after")
    def validate_ends_at(self) -> MeetingBase:
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be strictly later than starts_at")
        return self


class MeetingCreate(MeetingBase):
    pass


class MeetingOut(MeetingBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agenda: Agenda | None = None
