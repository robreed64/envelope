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


class DetectedAccount(BaseModel):
    bank_name: str
    account_id: str | None = None
    account_type: str | None = None
    fid: str | None = None
    resolved_id: uuid.UUID | None = None  # DB UUID of the matched/created Account record


class ImportPreviewResponse(BaseModel):
    transactions: list[ParsedTransaction]
    parse_errors: list[str] = []
    detected_account: DetectedAccount | None = None  # populated for OFX/QFX, null for CSV


class ImportTransactionItem(BaseModel):
    date: date
    amount: Decimal
    type: str
    note: str
    bank_ref: str
    envelope_id: uuid.UUID | None = None
    is_income: bool = False
    budget_month: date | None = None  # override which month imported income counts toward
    account_id: uuid.UUID | None = None  # resolved account FK to store on the transaction


class ImportConfirmRequest(BaseModel):
    transactions: list[ImportTransactionItem]
    account_name: str | None = None  # required for CSV imports — user-supplied account label


class ImportConfirmResponse(BaseModel):
    imported: int
    income_recorded: int


class AccountOut(BaseModel):
    id: uuid.UUID
    bank_name: str
    account_id: str | None
    account_type: str | None
    display_name: str | None

    model_config = {"from_attributes": True}
