import uuid
from datetime import datetime

from pydantic import BaseModel


class EnvelopeCreate(BaseModel):
    name: str
    group_name: str | None = None
    color: str | None = None
    envelope_type: str | None = None
    income_pct_target: float | None = None
    is_protected: bool = False


class EnvelopeUpdate(BaseModel):
    name: str | None = None
    group_name: str | None = None
    color: str | None = None
    is_active: bool | None = None
    rollover: bool | None = None
    sort_order: int | None = None
    envelope_type: str | None = None
    income_pct_target: float | None = None
    is_protected: bool | None = None


class EnvelopeResponse(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    name: str
    group_name: str | None
    color: str | None
    is_active: bool
    rollover: bool
    sort_order: int
    envelope_type: str | None
    income_pct_target: float | None
    is_protected: bool
    created_at: datetime

    model_config = {"from_attributes": True}
