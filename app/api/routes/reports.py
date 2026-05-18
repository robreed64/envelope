import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.period import Period
from app.models.transaction import Transaction
from app.schemas.reports import SpendingReport, SpendingRow, MonthlyCell

router = APIRouter(prefix="/households/{household_id}/reports", tags=["reports"])


@router.get("/spending", response_model=SpendingReport)
def spending_report(
    household_id: uuid.UUID,
    months: int = Query(default=6, ge=1, le=24),
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    today = date.today()
    base = today.year * 12 + today.month - 1
    month_starts = [
        date((base - i) // 12, (base - i) % 12 + 1, 1)
        for i in range(months - 1, -1, -1)
    ]

    cutoff = month_starts[0]

    # Spending per envelope per month (from transactions, excluding transfers)
    spent_rows = (
        db.query(
            func.date_trunc("month", Transaction.date).label("month"),
            Transaction.envelope_id,
            func.sum(
                case((Transaction.type == "debit", Transaction.amount), else_=0)
                - case((Transaction.type == "credit", Transaction.amount), else_=0)
            ).label("spent"),
        )
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Envelope.is_active == True,
            Transaction.deleted_at.is_(None),
            Transaction.transfer_id.is_(None),
            Transaction.date >= cutoff,
        )
        .group_by(func.date_trunc("month", Transaction.date), Transaction.envelope_id)
        .all()
    )

    # Allocated per envelope per month (from periods)
    alloc_rows = (
        db.query(Period.month, Period.envelope_id, Period.allocated)
        .join(Envelope, Period.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Envelope.is_active == True,
            Period.month >= cutoff,
        )
        .all()
    )

    # Index by (envelope_id, month_str)
    spent_map: dict[tuple, Decimal] = {}
    for r in spent_rows:
        key = (r.envelope_id, r.month.date().replace(day=1))
        spent_map[key] = Decimal(str(r.spent))

    alloc_map: dict[tuple, Decimal] = {}
    for r in alloc_rows:
        key = (r.envelope_id, r.month)
        alloc_map[key] = Decimal(str(r.allocated))

    envelopes = (
        db.query(Envelope)
        .filter_by(household_id=household_id, is_active=True)
        .order_by(Envelope.sort_order, Envelope.created_at)
        .all()
    )

    rows = []
    for env in envelopes:
        cells = []
        total_spent = Decimal("0")
        has_data = False
        for ms in month_starts:
            key = (env.id, ms)
            spent = spent_map.get(key, Decimal("0"))
            allocated = alloc_map.get(key, Decimal("0"))
            total_spent += spent
            if spent or allocated:
                has_data = True
            cells.append(MonthlyCell(
                month=ms.isoformat(),
                spent=spent,
                allocated=allocated,
            ))
        if has_data:
            rows.append(SpendingRow(
                envelope_id=env.id,
                envelope_name=env.name,
                group_name=env.group_name,
                monthly=cells,
                total=total_spent,
            ))

    month_labels = [ms.isoformat() for ms in month_starts]
    return SpendingReport(months=month_labels, rows=rows)
