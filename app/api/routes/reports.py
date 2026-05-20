import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.account import Account
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.period import Period
from app.models.transaction import Transaction
from app.schemas.reports import AccountGroup, SpendingReport, SpendingRow, MonthlyCell

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

    # Build per-envelope spending rows
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
            cells.append(MonthlyCell(month=ms.isoformat(), spent=spent, allocated=allocated))
        if has_data:
            rows.append(SpendingRow(
                envelope_id=env.id,
                envelope_name=env.name,
                group_name=env.group_name,
                monthly=cells,
                total=total_spent,
            ))

    # Build account groups — group envelopes by their funding_account_id
    account_map: dict[uuid.UUID, Account] = {
        a.id: a for a in db.query(Account).filter_by(household_id=household_id).all()
    }
    env_account: dict[uuid.UUID, uuid.UUID | None] = {
        env.id: env.funding_account_id for env in envelopes
    }

    # Collect unique account keys preserving order: assigned accounts first, then None
    seen: list[uuid.UUID | None] = []
    for env in envelopes:
        key = env.funding_account_id
        if key not in seen:
            seen.append(key)
    if None not in seen:
        seen.append(None)

    row_by_envelope = {r.envelope_id: r for r in rows}

    account_groups = []
    for acct_id in seen:
        group_rows = [
            row_by_envelope[env.id]
            for env in envelopes
            if env.funding_account_id == acct_id and env.id in row_by_envelope
        ]
        if not group_rows:
            continue
        monthly_totals = [
            sum(Decimal(str(r.monthly[i].spent)) for r in group_rows)
            for i in range(len(month_starts))
        ]
        acct = account_map.get(acct_id) if acct_id else None
        account_groups.append(AccountGroup(
            account_id=acct_id,
            account_name=acct.display_name or acct.bank_name if acct else None,
            rows=group_rows,
            monthly_totals=monthly_totals,
            total=sum(r.total for r in group_rows),
        ))

    month_labels = [ms.isoformat() for ms in month_starts]
    return SpendingReport(months=month_labels, rows=rows, account_groups=account_groups)
