import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class RecurringTemplateCreate(BaseModel):
    name: str
    amount: Decimal
    type: str = "debit"
    envelope_id: uuid.UUID
    day_of_month: int | None = None
    note: str | None = None


class RecurringTemplateUpdate(BaseModel):
    name: str | None = None
    amount: Decimal | None = None
    type: str | None = None
    envelope_id: uuid.UUID | None = None
    day_of_month: int | None = None
    note: str | None = None
    is_active: bool | None = None


class RecurringTemplateResponse(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    envelope_id: uuid.UUID
    envelope_name: str
    name: str
    amount: Decimal
    type: str
    day_of_month: int | None
    note: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplyRequest(BaseModel):
    date: date


class RecurringSuggestion(BaseModel):
    note: str
    envelope_id: uuid.UUID
    envelope_name: str
    type: str
    avg_amount: Decimal
    count: int
