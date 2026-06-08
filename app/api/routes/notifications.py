import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.period import Period
from app.models.transaction import Transaction

router = APIRouter(prefix="/households/{household_id}/notifications", tags=["notifications"])

NEAR_LIMIT_PCT = 80


def _month_bounds(today: date) -> tuple[date, date]:
    start = today.replace(day=1)
    if today.month == 12:
        end = date(today.year + 1, 1, 1)
    else:
        end = date(today.year, today.month + 1, 1)
    return start, end


@router.get("")
def get_notifications(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    today = date.today()
    month_start, next_month_start = _month_bounds(today)

    envelopes = (
        db.query(Envelope)
        .filter_by(household_id=household_id, is_active=True)
        .order_by(Envelope.sort_order)
        .all()
    )
    env_ids = [e.id for e in envelopes]

    periods = {
        p.envelope_id: p
        for p in db.query(Period)
        .filter(Period.envelope_id.in_(env_ids), Period.month == month_start)
        .all()
    } if env_ids else {}

    debits = {
        row.envelope_id: float(row.total)
        for row in db.query(Transaction.envelope_id, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.envelope_id.in_(env_ids),
            Transaction.type == "debit",
            Transaction.deleted_at.is_(None),
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .group_by(Transaction.envelope_id)
        .all()
    } if env_ids else {}

    credits = {
        row.envelope_id: float(row.total)
        for row in db.query(Transaction.envelope_id, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.envelope_id.in_(env_ids),
            Transaction.type == "credit",
            Transaction.deleted_at.is_(None),
            Transaction.date >= month_start,
            Transaction.date < next_month_start,
        )
        .group_by(Transaction.envelope_id)
        .all()
    } if env_ids else {}

    alerts = []
    for env in envelopes:
        period = periods.get(env.id)

        if period is None:
            alerts.append({
                "id": f"no_budget:{env.id}:{month_start}",
                "type": "no_budget",
                "severity": "low",
                "envelope_id": str(env.id),
                "envelope_name": env.name,
                "message": f"{env.name} has no budget set for this month",
            })
            continue

        allocated = float(period.allocated)
        rollover = float(period.rollover)
        spent = debits.get(env.id, 0.0) - credits.get(env.id, 0.0)
        total = allocated + rollover
        balance = total - spent
        pct = (spent / total * 100) if total > 0 else 0

        if balance < 0:
            alerts.append({
                "id": f"over_budget:{env.id}:{month_start}",
                "type": "over_budget",
                "severity": "high",
                "envelope_id": str(env.id),
                "envelope_name": env.name,
                "message": f"{env.name} is ${abs(balance):,.2f} over budget",
            })
        elif pct >= NEAR_LIMIT_PCT and total > 0:
            alerts.append({
                "id": f"near_limit:{env.id}:{month_start}",
                "type": "near_limit",
                "severity": "medium",
                "envelope_id": str(env.id),
                "envelope_name": env.name,
                "message": f"{env.name} is at {pct:.0f}% — ${balance:,.2f} left",
            })

    return {
        "alerts": alerts,
        "month": month_start.isoformat(),
    }
