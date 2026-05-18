import datetime
import uuid
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class IncomeCreate(BaseModel):
    amount: Decimal
    source: str
    date: datetime.date
    budget_month: Optional[datetime.date] = None
    is_estimate: bool = False


class IncomeUpdate(BaseModel):
    amount: Optional[Decimal] = None
    source: Optional[str] = None
    date: Optional[datetime.date] = None
    budget_month: Optional[datetime.date] = None


class IncomeResponse(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    amount: Decimal
    source: str
    date: datetime.date
    month: datetime.date
    bank_ref: Optional[str] = None
    is_estimate: bool
    created_at: datetime.datetime

    model_config = {"from_attributes": True}
