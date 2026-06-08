import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.recurring import RecurringTemplate
from app.models.transaction import Transaction
from app.schemas.recurring import ApplyRequest, RecurringSuggestion, RecurringTemplateCreate, RecurringTemplateResponse, RecurringTemplateUpdate
from app.schemas.transaction import TransactionResponse

router = APIRouter(prefix="/households/{household_id}/recurring", tags=["recurring"])


@router.get("", response_model=list[RecurringTemplateResponse])
def list_templates(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    templates = (
        db.query(RecurringTemplate)
        .options(joinedload(RecurringTemplate.envelope))
        .filter_by(household_id=household_id, is_active=True)
        .order_by(RecurringTemplate.name)
        .all()
    )
    return [_enrich(t) for t in templates]


@router.get("/suggestions", response_model=list[RecurringSuggestion])
def get_suggestions(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    cutoff = date.today() - timedelta(days=90)
    existing_names = {
        t.name.lower()
        for t in db.query(RecurringTemplate).filter_by(household_id=household_id, is_active=True).all()
    }
    rows = (
        db.query(
            func.min(Transaction.note).label("note"),
            Transaction.envelope_id,
            Envelope.name.label("envelope_name"),
            Transaction.type,
            func.avg(Transaction.amount).label("avg_amount"),
            func.count(Transaction.id).label("count"),
        )
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Transaction.deleted_at.is_(None),
            Transaction.transfer_id.is_(None),
            Transaction.note.isnot(None),
            Transaction.note != "",
            Transaction.date >= cutoff,
        )
        .group_by(func.lower(Transaction.note), Transaction.envelope_id, Envelope.name, Transaction.type)
        .order_by(func.count(Transaction.id).desc())
        .all()
    )
    return [
        RecurringSuggestion(
            note=r.note,
            envelope_id=r.envelope_id,
            envelope_name=r.envelope_name,
            type=r.type,
            avg_amount=Decimal(str(r.avg_amount)).quantize(Decimal("0.01")),
            count=r.count,
        )
        for r in rows
        if r.note.lower() not in existing_names
    ]


@router.post("", response_model=RecurringTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    household_id: uuid.UUID,
    body: RecurringTemplateCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, body.envelope_id, household_id)
    template = RecurringTemplate(household_id=household_id, **body.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return _enrich(template)


@router.patch("/{template_id}", response_model=RecurringTemplateResponse)
def update_template(
    household_id: uuid.UUID,
    template_id: uuid.UUID,
    body: RecurringTemplateUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    template = _get_or_404(db, template_id, household_id)
    if body.envelope_id is not None:
        _assert_envelope_belongs(db, body.envelope_id, household_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return _enrich(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    household_id: uuid.UUID,
    template_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    template = _get_or_404(db, template_id, household_id)
    template.is_active = False
    db.commit()


@router.post("/{template_id}/apply", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def apply_template(
    household_id: uuid.UUID,
    template_id: uuid.UUID,
    body: ApplyRequest,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    template = _get_or_404(db, template_id, household_id)
    tx = Transaction(
        envelope_id=template.envelope_id,
        amount=template.amount,
        type=template.type,
        date=body.date,
        note=template.note or template.name,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def _enrich(template: RecurringTemplate) -> RecurringTemplateResponse:
    return RecurringTemplateResponse(
        id=template.id,
        household_id=template.household_id,
        envelope_id=template.envelope_id,
        name=template.name,
        amount=template.amount,
        type=template.type,
        day_of_month=template.day_of_month,
        note=template.note,
        is_active=template.is_active,
        created_at=template.created_at,
        envelope_name=template.envelope.name,
    )


def _get_or_404(db: Session, template_id: uuid.UUID, household_id: uuid.UUID) -> RecurringTemplate:
    template = db.query(RecurringTemplate).filter_by(id=template_id, household_id=household_id, is_active=True).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return template


def _assert_envelope_belongs(db: Session, envelope_id: uuid.UUID, household_id: uuid.UUID):
    if not db.query(Envelope).filter_by(id=envelope_id, household_id=household_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envelope not found")
