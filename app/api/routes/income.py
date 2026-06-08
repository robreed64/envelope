import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.household import HouseholdMember
from app.models.income import Income
from app.schemas.income import IncomeCreate, IncomeResponse, IncomeUpdate

router = APIRouter(prefix="/households/{household_id}/income", tags=["income"])


@router.post("", response_model=IncomeResponse, status_code=status.HTTP_201_CREATED)
def add_income(
    household_id: uuid.UUID,
    body: IncomeCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    month = (body.budget_month or body.date).replace(day=1)

    if not body.is_estimate:
        db.query(Income).filter_by(
            household_id=household_id, month=month, is_estimate=True
        ).delete(synchronize_session=False)

    entry = Income(
        household_id=household_id,
        amount=body.amount,
        source=body.source,
        date=body.date,
        month=month,
        is_estimate=body.is_estimate,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=list[IncomeResponse])
def list_income(
    household_id: uuid.UUID,
    month: date = None,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    q = db.query(Income).filter_by(household_id=household_id)
    if month:
        q = q.filter(Income.month == month.replace(day=1))
    return q.order_by(Income.date.desc()).all()


@router.patch("/{income_id}", response_model=IncomeResponse)
def update_income(
    household_id: uuid.UUID,
    income_id: uuid.UUID,
    body: IncomeUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    entry = db.query(Income).filter_by(id=income_id, household_id=household_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income entry not found")
    if body.amount is not None:
        entry.amount = body.amount
    if body.source is not None:
        entry.source = body.source
    if body.date is not None:
        entry.date = body.date
    if body.budget_month is not None:
        entry.month = body.budget_month.replace(day=1)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(
    household_id: uuid.UUID,
    income_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    entry = db.query(Income).filter_by(id=income_id, household_id=household_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income entry not found")
    db.delete(entry)
    db.commit()
