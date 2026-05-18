import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.period import Period
from app.models.transaction import Transaction
from app.schemas.period import PeriodCreate, PeriodCopyRequest, PeriodCopyResult, PeriodResponse, PeriodSummary, PeriodUpdate

router = APIRouter(prefix="/households/{household_id}/envelopes/{envelope_id}/periods", tags=["periods"])
copy_router = APIRouter(prefix="/households/{household_id}/periods", tags=["periods"])


# ── Date helpers ──────────────────────────────────────────────────────────────

def _next_month_of(d: date) -> date:
    if d.month == 12:
        return d.replace(year=d.year + 1, month=1, day=1)
    return d.replace(month=d.month + 1, day=1)


def _prev_month_of(d: date) -> date:
    if d.month == 1:
        return d.replace(year=d.year - 1, month=12, day=1)
    return d.replace(month=d.month - 1, day=1)


# ── Balance helpers ───────────────────────────────────────────────────────────

def _calc_balance(allocated: Decimal, rollover: Decimal, debits: Decimal, credits: Decimal) -> Decimal:
    return allocated + rollover - debits + credits


def _tx_totals(db: Session, envelope_id: uuid.UUID, month_start: date, month_end: date) -> tuple[Decimal, Decimal]:
    """Return (debits, credits) for an envelope within [month_start, month_end)."""
    rows = (
        db.query(Transaction.type, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.envelope_id == envelope_id,
            Transaction.date >= month_start,
            Transaction.date < month_end,
            Transaction.deleted_at.is_(None),
        )
        .group_by(Transaction.type)
        .all()
    )
    totals = {row.type: Decimal(str(row.total)) for row in rows}
    return totals.get("debit", Decimal("0")), totals.get("credit", Decimal("0"))


def _live_rollover(db: Session, envelope_id: uuid.UUID, month: date) -> Decimal:
    """Return the previous period's live balance as rollover.

    Uses the previous period's stored rollover as its own base to avoid recursion —
    so the look-back is exactly one month deep and always reflects current transactions.
    """
    envelope = db.query(Envelope).filter_by(id=envelope_id).first()
    if not envelope or not envelope.rollover:
        return Decimal("0")
    prev_month = _prev_month_of(month)
    prev = db.query(Period).filter_by(envelope_id=envelope_id, month=prev_month).first()
    if not prev:
        return Decimal("0")
    debits, credits = _tx_totals(db, envelope_id, prev_month, month)
    return _calc_balance(Decimal(str(prev.allocated)), Decimal(str(prev.rollover)), debits, credits)


def _enrich(period: Period, db: Session) -> PeriodSummary:
    month_end = _next_month_of(period.month)
    debits, credits = _tx_totals(db, period.envelope_id, period.month, month_end)
    rollover = _live_rollover(db, period.envelope_id, period.month)
    allocated = Decimal(str(period.allocated))
    data = PeriodResponse.model_validate(period).model_dump()
    data["rollover"] = rollover
    return PeriodSummary(**data, spent=debits - credits, balance=_calc_balance(allocated, rollover, debits, credits))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("", response_model=PeriodResponse)
def create_period(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    body: PeriodCreate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, envelope_id, household_id)
    month = body.month.replace(day=1)
    existing = db.query(Period).filter_by(envelope_id=envelope_id, month=month).first()
    if existing:
        existing.allocated = body.allocated
        db.commit()
        db.refresh(existing)
        return existing
    rollover = _live_rollover(db, envelope_id, month)
    period = Period(envelope_id=envelope_id, month=month, allocated=body.allocated, rollover=rollover)
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


@router.get("", response_model=list[PeriodSummary])
def list_periods(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, envelope_id, household_id)
    periods = db.query(Period).filter_by(envelope_id=envelope_id).order_by(Period.month.desc()).all()
    return [_enrich(p, db) for p in periods]


@router.patch("/{period_id}", response_model=PeriodSummary)
def update_period(
    household_id: uuid.UUID,
    envelope_id: uuid.UUID,
    period_id: uuid.UUID,
    body: PeriodUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    _assert_envelope_belongs(db, envelope_id, household_id)
    period = db.query(Period).filter_by(id=period_id, envelope_id=envelope_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period not found")
    period.allocated = body.allocated
    db.commit()
    db.refresh(period)
    return _enrich(period, db)


def _assert_envelope_belongs(db: Session, envelope_id: uuid.UUID, household_id: uuid.UUID):
    if not db.query(Envelope).filter_by(id=envelope_id, household_id=household_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envelope not found")


# ── Bulk endpoints ────────────────────────────────────────────────────────────

@copy_router.get("", response_model=list[PeriodSummary])
def list_periods_for_month(
    household_id: uuid.UUID,
    month: date,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    month_start = month.replace(day=1)
    month_end = _next_month_of(month_start)
    prev_month_start = _prev_month_of(month_start)

    envelopes = db.query(Envelope).filter_by(household_id=household_id, is_active=True).all()
    rollover_flags = {e.id: e.rollover for e in envelopes}
    all_env_ids = list(rollover_flags.keys())
    if not all_env_ids:
        return []

    periods = (
        db.query(Period)
        .filter(Period.envelope_id.in_(all_env_ids), Period.month == month_start)
        .all()
    )
    if not periods:
        return []

    period_env_ids = [p.envelope_id for p in periods]

    # Current month transaction aggregation
    agg = (
        db.query(Transaction.envelope_id, Transaction.type, func.sum(Transaction.amount).label("total"))
        .filter(
            Transaction.envelope_id.in_(period_env_ids),
            Transaction.date >= month_start,
            Transaction.date < month_end,
            Transaction.deleted_at.is_(None),
        )
        .group_by(Transaction.envelope_id, Transaction.type)
        .all()
    )
    spent_map: dict = {}
    credits_map: dict = {}
    for row in agg:
        if row.type == "debit":
            spent_map[row.envelope_id] = Decimal(str(row.total))
        else:
            credits_map[row.envelope_id] = Decimal(str(row.total))

    # Previous month periods (for live rollover)
    prev_periods = {
        p.envelope_id: p
        for p in db.query(Period)
        .filter(Period.envelope_id.in_(period_env_ids), Period.month == prev_month_start)
        .all()
    }

    # Previous month transaction aggregation (only for envelopes with rollover + prev period)
    rollover_env_ids = [
        eid for eid in period_env_ids
        if rollover_flags.get(eid) and eid in prev_periods
    ]
    prev_spent_map: dict = {}
    prev_credits_map: dict = {}
    if rollover_env_ids:
        for row in (
            db.query(Transaction.envelope_id, Transaction.type, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.envelope_id.in_(rollover_env_ids),
                Transaction.date >= prev_month_start,
                Transaction.date < month_start,
                Transaction.deleted_at.is_(None),
            )
            .group_by(Transaction.envelope_id, Transaction.type)
            .all()
        ):
            if row.type == "debit":
                prev_spent_map[row.envelope_id] = Decimal(str(row.total))
            else:
                prev_credits_map[row.envelope_id] = Decimal(str(row.total))

    result = []
    for period in periods:
        eid = period.envelope_id
        debits = spent_map.get(eid, Decimal("0"))
        credits = credits_map.get(eid, Decimal("0"))

        if rollover_flags.get(eid) and eid in prev_periods:
            prev = prev_periods[eid]
            rollover = _calc_balance(
                Decimal(str(prev.allocated)),
                Decimal(str(prev.rollover)),
                prev_spent_map.get(eid, Decimal("0")),
                prev_credits_map.get(eid, Decimal("0")),
            )
        else:
            rollover = Decimal("0")

        allocated = Decimal(str(period.allocated))
        data = PeriodResponse.model_validate(period).model_dump()
        data["rollover"] = rollover
        result.append(PeriodSummary(
            **data,
            spent=debits - credits,
            balance=_calc_balance(allocated, rollover, debits, credits),
        ))
    return result


@copy_router.post("/copy", response_model=PeriodCopyResult)
def copy_periods(
    household_id: uuid.UUID,
    body: PeriodCopyRequest,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    from_month = body.from_month.replace(day=1)
    to_month = body.to_month.replace(day=1)
    prev_month = _prev_month_of(to_month)

    envelopes = db.query(Envelope).filter_by(household_id=household_id, is_active=True).all()
    env_map = {e.id: e for e in envelopes}
    env_ids = list(env_map.keys())
    if not env_ids:
        return PeriodCopyResult(copied=0, skipped=0)

    from_periods = {
        p.envelope_id: p
        for p in db.query(Period).filter(Period.envelope_id.in_(env_ids), Period.month == from_month).all()
    }
    existing_to = {
        p.envelope_id
        for p in db.query(Period.envelope_id).filter(Period.envelope_id.in_(env_ids), Period.month == to_month).all()
    }

    to_copy_ids = [eid for eid in from_periods if eid not in existing_to]
    skipped = sum(1 for eid in from_periods if eid in existing_to)

    if not to_copy_ids:
        return PeriodCopyResult(copied=0, skipped=skipped)

    # Batch-compute live rollover: load prev_month periods + transactions once
    rollover_ids = [eid for eid in to_copy_ids if env_map[eid].rollover]
    prev_periods = {
        p.envelope_id: p
        for p in db.query(Period).filter(Period.envelope_id.in_(rollover_ids), Period.month == prev_month).all()
    } if rollover_ids else {}

    rollover_eligible = [eid for eid in rollover_ids if eid in prev_periods]
    prev_spent_map: dict = {}
    prev_credits_map: dict = {}
    if rollover_eligible:
        for row in (
            db.query(Transaction.envelope_id, Transaction.type, func.sum(Transaction.amount).label("total"))
            .filter(
                Transaction.envelope_id.in_(rollover_eligible),
                Transaction.date >= prev_month,
                Transaction.date < to_month,
                Transaction.deleted_at.is_(None),
            )
            .group_by(Transaction.envelope_id, Transaction.type)
            .all()
        ):
            if row.type == "debit":
                prev_spent_map[row.envelope_id] = Decimal(str(row.total))
            else:
                prev_credits_map[row.envelope_id] = Decimal(str(row.total))

    for eid in to_copy_ids:
        if env_map[eid].rollover and eid in prev_periods:
            prev = prev_periods[eid]
            rollover = _calc_balance(
                Decimal(str(prev.allocated)),
                Decimal(str(prev.rollover)),
                prev_spent_map.get(eid, Decimal("0")),
                prev_credits_map.get(eid, Decimal("0")),
            )
        else:
            rollover = Decimal("0")
        db.add(Period(
            envelope_id=eid,
            month=to_month,
            allocated=from_periods[eid].allocated,
            rollover=rollover,
        ))

    db.commit()
    return PeriodCopyResult(copied=len(to_copy_ids), skipped=skipped)
