import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel

_Date = date  # alias so field name `date: date|None` can't shadow the type


class TransactionCreate(BaseModel):
    amount: Decimal
    type: str
    date: date
    note: str | None = None


class TransactionUpdate(BaseModel):
    amount: Decimal | None = None
    type: str | None = None
    date: _Date | None = None
    note: str | None = None


class TransferCreate(BaseModel):
    from_envelope_id: uuid.UUID
    to_envelope_id: uuid.UUID
    amount: Decimal
    date: date
    note: str | None = None


class SplitLeg(BaseModel):
    envelope_id: uuid.UUID
    amount: Decimal
    note: str | None = None


class SplitCreate(BaseModel):
    date: date
    legs: list[SplitLeg]


class TransactionResponse(BaseModel):
    id: uuid.UUID
    envelope_id: uuid.UUID
    amount: Decimal
    type: str
    transfer_id: uuid.UUID | None
    split_id: uuid.UUID | None
    date: date
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionSearchResult(BaseModel):
    id: uuid.UUID
    envelope_id: uuid.UUID
    envelope_name: str
    amount: Decimal
    type: str
    transfer_id: uuid.UUID | None
    split_id: uuid.UUID | None
    date: date
    note: str | None
