import uuid
from decimal import Decimal

from pydantic import BaseModel


class MonthlyCell(BaseModel):
    month: str
    spent: Decimal
    allocated: Decimal


class SpendingRow(BaseModel):
    envelope_id: uuid.UUID
    envelope_name: str
    group_name: str | None
    monthly: list[MonthlyCell]
    total: Decimal


class SpendingReport(BaseModel):
    months: list[str]
    rows: list[SpendingRow]
