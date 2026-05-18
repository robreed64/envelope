import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class PeriodCreate(BaseModel):
    month: date
    allocated: Decimal


class PeriodUpdate(BaseModel):
    allocated: Decimal


class PeriodResponse(BaseModel):
    id: uuid.UUID
    envelope_id: uuid.UUID
    month: date
    allocated: Decimal
    rollover: Decimal = Decimal("0")
    created_at: datetime

    model_config = {"from_attributes": True}


class PeriodSummary(PeriodResponse):
    spent: Decimal
    balance: Decimal


class PeriodCopyRequest(BaseModel):
    from_month: date
    to_month: date


class PeriodCopyResult(BaseModel):
    copied: int
    skipped: int
