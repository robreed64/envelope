import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ParsedTransaction(BaseModel):
    id: str  # temp client-side id, not persisted
    date: date
    description: str
    amount: Decimal
    type: str  # debit | credit
    bank_ref: str
    duplicate: bool = False      # already exists as an expense — skip to avoid double-counting
    already_income: bool = False  # already exists as income — allow re-budgeting


class ImportPreviewResponse(BaseModel):
    transactions: list[ParsedTransaction]
    parse_errors: list[str] = []


class ImportTransactionItem(BaseModel):
    date: date
    amount: Decimal
    type: str
    note: str
    bank_ref: str
    envelope_id: uuid.UUID | None = None
    is_income: bool = False
    budget_month: date | None = None  # override which month imported income counts toward


class ImportConfirmRequest(BaseModel):
    transactions: list[ImportTransactionItem]


class ImportConfirmResponse(BaseModel):
    imported: int
    income_recorded: int
