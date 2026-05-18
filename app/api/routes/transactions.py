import csv
import io
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.income import Income
from app.models.payee import PayeeAlias
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionResponse, TransactionSearchResult, TransactionUpdate, TransferCreate, SplitCreate

router = APIRouter(prefix="/households/{household_id}/envelopes/{envelope_id}/transactions", tags=["transactions"])
transfer_router = APIRouter(prefix="/households/{household_id}/transfers", tags=["transactions"])
split_router = APIRouter(prefix="/households/{household_id}/splits", tags=["transactions"])
search_router = APIRouter(prefix="/households/{household_id}/transactions", tags=["transactions"])


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    body: TransactionCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, envelope_id, household_id)
    if body.type not in ("debit", "credit"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Use the /transfers endpoint for transfers")

    tx = Transaction(envelope_id=envelope_id, **body.model_dump())
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    month: date | None = None,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, envelope_id, household_id)
    q = (
        db.query(Transaction)
        .filter_by(envelope_id=envelope_id)
        .filter(Transaction.deleted_at.is_(None))
    )
    if month:
        month_start = month.replace(day=1)
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1)
        q = q.filter(Transaction.date >= month_start, Transaction.date < month_end)
    return q.order_by(Transaction.date.desc()).all()


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter_by(id=transaction_id, envelope_id=envelope_id).first()
    if not tx or tx.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    if body.amount is not None:
        tx.amount = body.amount
    if body.type is not None:
        if body.type not in ("debit", "credit"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="type must be debit or credit")
        tx.type = body.type
    if body.date is not None:
        tx.date = body.date
    if "note" in body.model_fields_set:
        tx.note = body.note
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    transaction_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    tx = db.query(Transaction).filter_by(id=transaction_id, envelope_id=envelope_id).first()
    if not tx or tx.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
    tx.deleted_at = datetime.now(timezone.utc)
    db.commit()


@transfer_router.post("", response_model=list[TransactionResponse], status_code=status.HTTP_201_CREATED)
def create_transfer(
    household_id: uuid.UUID,
    body: TransferCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, body.from_envelope_id, household_id)
    _assert_envelope_belongs(db, body.to_envelope_id, household_id)

    from_env = db.query(Envelope).filter_by(id=body.from_envelope_id).first()
    to_env = db.query(Envelope).filter_by(id=body.to_envelope_id).first()

    transfer_id = uuid.uuid4()
    base_note = body.note or ""
    debit = Transaction(
        envelope_id=body.from_envelope_id,
        amount=body.amount,
        type="debit",
        transfer_id=transfer_id,
        date=body.date,
        note=f"Transfer to {to_env.name}" + (f" — {base_note}" if base_note else ""),
    )
    credit = Transaction(
        envelope_id=body.to_envelope_id,
        amount=body.amount,
        type="credit",
        transfer_id=transfer_id,
        date=body.date,
        note=f"Transfer from {from_env.name}" + (f" — {base_note}" if base_note else ""),
    )
    db.add_all([debit, credit])
    db.commit()
    db.refresh(debit)
    db.refresh(credit)
    return [debit, credit]


@transfer_router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    household_id: uuid.UUID,
    transfer_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    sides = (
        db.query(Transaction)
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Transaction.transfer_id == transfer_id,
            Envelope.household_id == household_id,
            Transaction.deleted_at.is_(None),
        )
        .all()
    )
    if not sides:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer not found")
    for tx in sides:
        tx.deleted_at = datetime.now(timezone.utc)
    db.commit()


@split_router.post("", response_model=list[TransactionResponse], status_code=status.HTTP_201_CREATED)
def create_split(
    household_id: uuid.UUID,
    body: SplitCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    if len(body.legs) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A split requires at least 2 legs")
    for leg in body.legs:
        _assert_envelope_belongs(db, leg.envelope_id, household_id)

    split_id = uuid.uuid4()
    txs = [
        Transaction(
            envelope_id=leg.envelope_id,
            amount=leg.amount,
            type="debit",
            split_id=split_id,
            date=body.date,
            note=leg.note,
        )
        for leg in body.legs
    ]
    db.add_all(txs)
    db.commit()
    for tx in txs:
        db.refresh(tx)
    return txs


@split_router.delete("/{split_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_split(
    household_id: uuid.UUID,
    split_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    legs = (
        db.query(Transaction)
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Transaction.split_id == split_id,
            Envelope.household_id == household_id,
            Transaction.deleted_at.is_(None),
        )
        .all()
    )
    if not legs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Split not found")
    for tx in legs:
        tx.deleted_at = datetime.now(timezone.utc)
    db.commit()


@search_router.get("/search", response_model=list[TransactionSearchResult])
def search_transactions(
    household_id: uuid.UUID,
    q: str = Query(default="", min_length=1),
    limit: int = Query(default=50, le=200),
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    results = (
        db.query(Transaction, Envelope.name.label("envelope_name"))
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Transaction.deleted_at.is_(None),
            func.lower(Transaction.note).contains(q.lower()),
        )
        .order_by(Transaction.date.desc())
        .limit(limit)
        .all()
    )
    return [
        TransactionSearchResult(
            id=tx.id,
            envelope_id=tx.envelope_id,
            envelope_name=envelope_name,
            amount=tx.amount,
            type=tx.type,
            transfer_id=tx.transfer_id,
            split_id=tx.split_id,
            date=tx.date,
            note=tx.note,
        )
        for tx, envelope_name in results
    ]


@search_router.get("/export")
def export_transactions_csv(
    household_id: uuid.UUID,
    start: date | None = None,
    end: date | None = None,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    tq = (
        db.query(
            Transaction,
            Envelope.name.label("envelope_name"),
            Envelope.group_name,
            Envelope.envelope_type,
            PayeeAlias.alias.label("payee_alias"),
        )
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .outerjoin(
            PayeeAlias,
            (PayeeAlias.household_id == household_id) & (PayeeAlias.raw == Transaction.note),
        )
        .filter(Envelope.household_id == household_id, Transaction.deleted_at.is_(None))
    )
    if start:
        tq = tq.filter(Transaction.date >= start)
    if end:
        tq = tq.filter(Transaction.date <= end)
    tx_rows = tq.order_by(Transaction.date.desc()).all()

    iq = db.query(Income).filter(Income.household_id == household_id)
    if start:
        iq = iq.filter(Income.date >= start)
    if end:
        iq = iq.filter(Income.date <= end)
    income_rows = iq.order_by(Income.date.desc()).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Envelope", "Group", "Envelope Type", "Transaction Type", "Amount", "Payee", "Note", "Bank Ref", "Budget Month", "Is Estimate"])
    for tx, envelope_name, group_name, envelope_type, payee_alias in tx_rows:
        writer.writerow([
            tx.date.isoformat(),
            envelope_name,
            group_name or "",
            envelope_type or "",
            tx.type,
            str(tx.amount),
            payee_alias or tx.note or "",
            tx.note or "",
            tx.bank_ref or "",
            "",
            "",
        ])
    for inc in income_rows:
        writer.writerow([
            inc.date.isoformat(),
            "",
            "",
            "",
            "income",
            str(inc.amount),
            inc.source,
            inc.source,
            inc.bank_ref or "",
            inc.month.isoformat(),
            "yes" if inc.is_estimate else "no",
        ])

    start_str = start.isoformat() if start else "all"
    end_str = end.isoformat() if end else "all"
    filename = f"transactions-{start_str}-to-{end_str}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _assert_envelope_belongs(db: Session, envelope_id: uuid.UUID, household_id: uuid.UUID):
    if not db.query(Envelope).filter_by(id=envelope_id, household_id=household_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envelope not found")
