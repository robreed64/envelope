import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.user import User
from app.schemas.envelope import EnvelopeCreate, EnvelopeResponse, EnvelopeUpdate

router = APIRouter(prefix="/households/{household_id}/envelopes", tags=["envelopes"])


@router.post("", response_model=EnvelopeResponse, status_code=status.HTTP_201_CREATED)
def create_envelope(
    household_id: uuid.UUID,
    body: EnvelopeCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    max_order = db.query(func.max(Envelope.sort_order)).filter_by(household_id=household_id).scalar() or 0
    envelope = Envelope(household_id=household_id, sort_order=max_order + 1, **body.model_dump())
    db.add(envelope)
    db.commit()
    db.refresh(envelope)
    return envelope


@router.get("", response_model=list[EnvelopeResponse])
def list_envelopes(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    return (
        db.query(Envelope)
        .filter_by(household_id=household_id, is_active=True)
        .order_by(Envelope.sort_order, Envelope.created_at)
        .all()
    )


@router.patch("/{envelope_id}", response_model=EnvelopeResponse)
def update_envelope(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    body: EnvelopeUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    envelope = _get_envelope(db, envelope_id, household_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(envelope, field, value)
    db.commit()
    db.refresh(envelope)
    return envelope


def _get_envelope(db: Session, envelope_id: uuid.UUID, household_id: uuid.UUID) -> Envelope:
    envelope = db.query(Envelope).filter_by(id=envelope_id, household_id=household_id).first()
    if not envelope:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envelope not found")
    return envelope
