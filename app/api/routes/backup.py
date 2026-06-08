import json
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_household_role
from app.core.database import get_db
from app.models.account import Account
from app.models.envelope import Envelope
from app.models.household import Household, HouseholdMember
from app.models.income import Income
from app.models.period import Period
from app.models.recurring import RecurringTemplate
from app.models.transaction import Transaction
from app.models.user import User

router = APIRouter(prefix="/households/{household_id}/data", tags=["backup"])

VALID_ITEMS = {"accounts", "envelopes", "map", "recurring", "income", "transactions", "household"}


def _parse_items(items: str) -> set[str]:
    chosen = {i.strip() for i in items.split(",") if i.strip()}
    unknown = chosen - VALID_ITEMS
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown items: {unknown}")
    return chosen


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/export")
def export_backup(
    household_id: uuid.UUID,
    items: str = "accounts,envelopes,map,recurring,income,transactions",
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    chosen = _parse_items(items)
    household = db.query(Household).filter_by(id=household_id).first()
    payload = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "household_name": household.name if household else "",
    }

    active_envs = (
        db.query(Envelope)
        .filter_by(household_id=household_id, is_active=True)
        .order_by(Envelope.sort_order)
        .all()
    )
    env_map = {e.id: e.name for e in active_envs}

    if "accounts" in chosen:
        accts = db.query(Account).filter_by(household_id=household_id).order_by(Account.created_at).all()
        payload["accounts"] = [
            {
                "bank_name": a.bank_name,
                "display_name": a.display_name,
                "account_type": a.account_type,
                "account_id": a.account_id,
            }
            for a in accts
        ]

    if "envelopes" in chosen:
        env_ids = [e.id for e in active_envs]
        all_periods = (
            db.query(Period).filter(Period.envelope_id.in_(env_ids)).order_by(Period.month).all()
            if env_ids else []
        )
        periods_by_env: dict = {}
        for p in all_periods:
            periods_by_env.setdefault(p.envelope_id, []).append(p)
        payload["envelopes"] = [
            {
                "name": env.name,
                "envelope_type": env.envelope_type,
                "rollover": env.rollover,
                "is_protected": env.is_protected,
                "sort_order": env.sort_order,
                "periods": [{"month": p.month.isoformat(), "allocated": float(p.allocated)} for p in periods_by_env.get(env.id, [])],
            }
            for env in active_envs
        ]

    if "map" in chosen:
        payload["map"] = {
            "season": household.season,
            "annual_income": float(household.annual_income) if household.annual_income else None,
        }

    if "recurring" in chosen:
        rows = (
            db.query(RecurringTemplate, Envelope.name.label("env_name"))
            .join(Envelope, RecurringTemplate.envelope_id == Envelope.id)
            .filter(RecurringTemplate.household_id == household_id, RecurringTemplate.is_active.is_(True))
            .all()
        )
        payload["recurring"] = [
            {
                "name": rt.name,
                "envelope_name": env_name,
                "amount": float(rt.amount),
                "type": rt.type,
                "day_of_month": rt.day_of_month,
                "note": rt.note,
            }
            for rt, env_name in rows
        ]

    if "income" in chosen:
        rows = db.query(Income).filter_by(household_id=household_id).order_by(Income.date.desc()).all()
        payload["income"] = [
            {
                "amount": float(inc.amount),
                "source": inc.source,
                "date": inc.date.isoformat(),
                "month": inc.month.isoformat(),
                "bank_ref": inc.bank_ref,
            }
            for inc in rows
        ]

    if "transactions" in chosen:
        all_txs = (
            db.query(Transaction)
            .filter(
                Transaction.envelope_id.in_(list(env_map.keys())),
                Transaction.deleted_at.is_(None),
            )
            .order_by(Transaction.date.desc())
            .all()
        ) if env_map else []
        acct_id_to_name = {
            a.id: a.bank_name
            for a in db.query(Account).filter_by(household_id=household_id).all()
        } if all_txs else {}
        payload["transactions"] = [
            {
                "envelope_name": env_map[tx.envelope_id],
                "account_name": acct_id_to_name.get(tx.account_id) if tx.account_id else None,
                "amount": float(tx.amount),
                "type": tx.type,
                "date": tx.date.isoformat(),
                "note": tx.note,
                "bank_ref": tx.bank_ref,
                "transfer_id": str(tx.transfer_id) if tx.transfer_id else None,
                "split_id": str(tx.split_id) if tx.split_id else None,
            }
            for tx in all_txs
        ]

    filename = f"envelope-backup-{datetime.now(timezone.utc).strftime('%Y%m%d')}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_data(
    household_id: uuid.UUID,
    items: str,
    acting: HouseholdMember = Depends(require_household_role(["owner"])),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chosen = _parse_items(items)

    if "household" in chosen:
        db.query(Household).filter_by(id=household_id).delete(synchronize_session=False)
        new_hh = Household(name="My Budget", owner_id=current_user.id)
        db.add(new_hh)
        db.flush()
        db.add(HouseholdMember(household_id=new_hh.id, user_id=current_user.id, role="owner"))
        current_user.wizard_completed = False
        current_user.wizard_skipped = False
        db.commit()
        return

    if "accounts" in chosen:
        env_ids_all = [e.id for e in db.query(Envelope.id).filter_by(household_id=household_id).all()]
        if env_ids_all:
            db.query(Transaction).filter(Transaction.envelope_id.in_(env_ids_all)).update(
                {"account_id": None}, synchronize_session=False
            )
        db.query(Account).filter_by(household_id=household_id).delete(synchronize_session=False)

    if "transactions" in chosen and "envelopes" not in chosen:
        env_ids = [e.id for e in db.query(Envelope.id).filter_by(household_id=household_id, is_active=True).all()]
        if env_ids:
            db.query(Transaction).filter(
                Transaction.envelope_id.in_(env_ids),
                Transaction.deleted_at.is_(None),
            ).delete(synchronize_session=False)

    if "envelopes" in chosen:
        db.query(Envelope).filter_by(household_id=household_id).delete(synchronize_session=False)

    if "recurring" in chosen:
        db.query(RecurringTemplate).filter_by(household_id=household_id).delete(synchronize_session=False)

    if "income" in chosen:
        db.query(Income).filter_by(household_id=household_id).delete(synchronize_session=False)

    if "map" in chosen:
        household = db.query(Household).filter_by(id=household_id).first()
        if household:
            household.season = None
            household.annual_income = None

    db.commit()


# ── Restore ───────────────────────────────────────────────────────────────────

@router.post("/restore", status_code=status.HTTP_200_OK)
def restore_backup(
    household_id: uuid.UUID,
    body: dict,
    items: str = "envelopes,map,recurring,income,transactions",
    acting: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    chosen = _parse_items(items)
    stats = {}

    env_name_map = {
        e.name: e.id
        for e in db.query(Envelope).filter_by(household_id=household_id, is_active=True).all()
    }

    account_name_map = {
        a.bank_name: a.id
        for a in db.query(Account).filter_by(household_id=household_id).all()
    }

    if "accounts" in chosen and "accounts" in body:
        created = 0
        for item in body.get("accounts", []):
            bank_name = item.get("bank_name", "").strip()
            if not bank_name or bank_name in account_name_map:
                continue
            acct = Account(
                household_id=household_id,
                bank_name=bank_name,
                display_name=item.get("display_name"),
                account_type=item.get("account_type"),
                account_id=item.get("account_id"),
            )
            db.add(acct)
            db.flush()
            account_name_map[bank_name] = acct.id
            created += 1
        stats["accounts"] = created

    if "map" in chosen and "map" in body:
        m = body["map"]
        household = db.query(Household).filter_by(id=household_id).first()
        if household:
            if m.get("season") is not None:
                household.season = m["season"]
            if m.get("annual_income") is not None:
                household.annual_income = m["annual_income"]
        stats["map"] = 1

    if "envelopes" in chosen and "envelopes" in body:
        created = 0
        for item in body.get("envelopes", []):
            name = item.get("name", "").strip()
            if not name or name in env_name_map:
                continue
            env = Envelope(
                household_id=household_id,
                name=name,
                envelope_type=item.get("envelope_type"),
                rollover=item.get("rollover", True),
                is_protected=item.get("is_protected", False),
                sort_order=item.get("sort_order", 0),
            )
            db.add(env)
            db.flush()
            env_name_map[name] = env.id
            for p in item.get("periods", []):
                db.add(Period(
                    envelope_id=env.id,
                    month=date.fromisoformat(p["month"]),
                    allocated=p["allocated"],
                ))
            created += 1
        stats["envelopes"] = created

    if "recurring" in chosen and "recurring" in body:
        existing_names = {
            r.name for r in db.query(RecurringTemplate.name).filter_by(household_id=household_id).all()
        }
        created = 0
        for item in body.get("recurring", []):
            name = item.get("name", "").strip()
            env_name = item.get("envelope_name", "")
            if not name or name in existing_names or env_name not in env_name_map:
                continue
            db.add(RecurringTemplate(
                household_id=household_id,
                envelope_id=env_name_map[env_name],
                name=name,
                amount=item["amount"],
                type=item.get("type", "debit"),
                day_of_month=item.get("day_of_month"),
                note=item.get("note"),
            ))
            created += 1
        stats["recurring"] = created

    if "income" in chosen and "income" in body:
        existing_income: set = set()
        for inc in db.query(Income).filter_by(household_id=household_id).all():
            if inc.bank_ref:
                existing_income.add(('ref', inc.bank_ref))
            else:
                existing_income.add(('c', float(inc.amount), inc.source, inc.date.isoformat(), inc.month.isoformat()))
        created = 0
        for item in body.get("income", []):
            ref = item.get("bank_ref")
            key = ('ref', ref) if ref else ('c', float(item["amount"]), item.get("source", ""), item["date"], item["month"])
            if key in existing_income:
                continue
            existing_income.add(key)
            db.add(Income(
                household_id=household_id,
                amount=item["amount"],
                source=item.get("source", ""),
                date=date.fromisoformat(item["date"]),
                month=date.fromisoformat(item["month"]),
                bank_ref=ref,
            ))
            created += 1
        stats["income"] = created

    if "transactions" in chosen and "transactions" in body:
        env_ids = list(env_name_map.values())
        existing_tx: set = set()
        if env_ids:
            for tx in (
                db.query(Transaction, Envelope.name.label("env_name"))
                .join(Envelope, Transaction.envelope_id == Envelope.id)
                .filter(Transaction.envelope_id.in_(env_ids), Transaction.deleted_at.is_(None))
                .all()
            ):
                t, env_name = tx
                if t.bank_ref:
                    existing_tx.add(('ref', t.bank_ref))
                else:
                    existing_tx.add(('c', float(t.amount), t.type, t.date.isoformat(), t.note or '', env_name))
        created = 0
        transfer_id_remap = {}
        split_id_remap = {}
        for item in body.get("transactions", []):
            env_name = item.get("envelope_name", "")
            if env_name not in env_name_map:
                continue
            ref = item.get("bank_ref")
            key = ('ref', ref) if ref else ('c', float(item["amount"]), item["type"], item["date"], item.get("note") or '', env_name)
            if key in existing_tx:
                continue
            existing_tx.add(key)
            old_tid = item.get("transfer_id")
            new_tid = None
            if old_tid:
                if old_tid not in transfer_id_remap:
                    transfer_id_remap[old_tid] = uuid.uuid4()
                new_tid = transfer_id_remap[old_tid]
            old_sid = item.get("split_id")
            new_sid = None
            if old_sid:
                if old_sid not in split_id_remap:
                    split_id_remap[old_sid] = uuid.uuid4()
                new_sid = split_id_remap[old_sid]
            acct_name = item.get("account_name")
            db.add(Transaction(
                envelope_id=env_name_map[env_name],
                account_id=account_name_map.get(acct_name) if acct_name else None,
                amount=item["amount"],
                type=item["type"],
                date=date.fromisoformat(item["date"]),
                note=item.get("note"),
                bank_ref=ref,
                transfer_id=new_tid,
                split_id=new_sid,
            ))
            created += 1
        stats["transactions"] = created

    db.commit()
    return {"restored": stats}
