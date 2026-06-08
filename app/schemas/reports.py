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
    envelope_type: str | None
    monthly: list[MonthlyCell]
    total: Decimal


class AccountGroup(BaseModel):
    account_id: uuid.UUID | None
    account_name: str | None
    rows: list[SpendingRow]
    monthly_totals: list[Decimal]
    total: Decimal


class SpendingReport(BaseModel):
    months: list[str]
    rows: list[SpendingRow]
    account_groups: list[AccountGroup]
