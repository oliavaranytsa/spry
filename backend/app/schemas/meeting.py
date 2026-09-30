import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


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
    id: uuid.UUID

    class Config:
        from_attributes = True
