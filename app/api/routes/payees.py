import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.payee import PayeeAlias
from app.models.transaction import Transaction
from app.schemas.payee import PayeeAliasResponse, PayeeAliasUpsert

router = APIRouter(prefix="/households/{household_id}/payees", tags=["payees"])


@router.get("/assignments", response_model=dict[str, str])
def get_payee_assignments(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    """Return the most recently used envelope_id for each unique transaction note."""
    rows = db.execute(
        text("""
            SELECT DISTINCT ON (t.note) t.note, t.envelope_id::text
            FROM transactions t
            JOIN envelopes e ON e.id = t.envelope_id
            WHERE e.household_id = :hid
              AND t.deleted_at IS NULL
              AND t.note IS NOT NULL
              AND t.note != ''
              AND t.transfer_id IS NULL
            ORDER BY t.note, t.date DESC
        """),
        {"hid": str(household_id)},
    ).fetchall()
    return {row[0]: row[1] for row in rows}


@router.get("/notes", response_model=list[str])
def list_raw_notes(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    """Return distinct non-null transaction notes for this household, sorted alphabetically."""
    rows = (
        db.query(func.distinct(Transaction.note))
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Transaction.note.isnot(None),
            Transaction.note != "",
            Transaction.deleted_at.is_(None),
        )
        .order_by(Transaction.note)
        .all()
    )
    return [r[0] for r in rows]


@router.get("", response_model=list[PayeeAliasResponse])
def list_aliases(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    return db.query(PayeeAlias).filter_by(household_id=household_id).order_by(PayeeAlias.raw).all()


@router.put("", response_model=PayeeAliasResponse, status_code=status.HTTP_200_OK)
def upsert_alias(
    household_id: uuid.UUID,
    body: PayeeAliasUpsert,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    existing = db.query(PayeeAlias).filter_by(household_id=household_id, raw=body.raw).first()
    if existing:
        existing.alias = body.alias
    else:
        existing = PayeeAlias(household_id=household_id, raw=body.raw, alias=body.alias)
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_alias(
    household_id: uuid.UUID,
    body: PayeeAliasUpsert,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    existing = db.query(PayeeAlias).filter_by(household_id=household_id, raw=body.raw).first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(existing)
    db.commit()
