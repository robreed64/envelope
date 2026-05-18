import csv
import hashlib
import io
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from dateutil import parser as dateparser
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.api.deps import require_household_role
from app.core.database import get_db
from app.models.envelope import Envelope
from app.models.household import HouseholdMember
from app.models.income import Income
from app.models.transaction import Transaction
from app.schemas.imports import (
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportPreviewResponse,
    ParsedTransaction,
)

router = APIRouter(prefix="/households/{household_id}/import", tags=["import"])

SUPPORTED_TYPES = {
    "application/octet-stream", "text/csv", "text/plain",
    "application/vnd.ms-excel", "",
}


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    household_id: uuid.UUID,
    file: UploadFile = File(...),
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    content = await file.read()
    name = (file.filename or "").lower()

    try:
        if name.endswith(".qfx") or name.endswith(".ofx"):
            transactions, errors = _parse_ofx(content)
        else:
            transactions, errors = _parse_csv(content)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # mark transactions already in this household as duplicates
    bank_refs = {t.bank_ref for t in transactions}
    existing_expense_refs = {
        row.bank_ref
        for row in db.query(Transaction.bank_ref)
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Transaction.bank_ref.in_(bank_refs),
            Transaction.bank_ref.isnot(None),
            Transaction.deleted_at.is_(None),
        )
        .all()
    }
    existing_income_refs = {
        row.bank_ref
        for row in db.query(Income.bank_ref)
        .filter(
            Income.household_id == household_id,
            Income.bank_ref.in_(bank_refs),
            Income.bank_ref.isnot(None),
            Income.is_estimate == False,
        )
        .all()
    }
    # Also match manually-added real income (no bank_ref) by amount + month, never estimates
    income_amount_months = {
        (str(row.amount), row.month)
        for row in db.query(Income.amount, Income.month)
        .filter(Income.household_id == household_id, Income.is_estimate == False)
        .all()
    }
    for tx in transactions:
        tx.duplicate = tx.bank_ref in existing_expense_refs
        tx_month = tx.date.replace(day=1)
        tx.already_income = (
            tx.bank_ref in existing_income_refs
            or (tx.type == "credit" and (str(tx.amount), tx_month) in income_amount_months)
        )

    return ImportPreviewResponse(transactions=transactions, parse_errors=errors)


@router.post("/confirm", response_model=ImportConfirmResponse)
def confirm_import(
    household_id: uuid.UUID,
    body: ImportConfirmRequest,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    tx_items = [t for t in body.transactions if not t.is_income]
    income_items = [t for t in body.transactions if t.is_income]

    # verify all envelope IDs belong to this household
    envelope_ids = {t.envelope_id for t in tx_items if t.envelope_id}
    if envelope_ids:
        valid = {
            e.id
            for e in db.query(Envelope).filter(
                Envelope.id.in_(envelope_ids),
                Envelope.household_id == household_id,
            ).all()
        }
        invalid = envelope_ids - valid
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more envelopes do not belong to this household",
            )

    # final dedup check on confirm — skip any that snuck in
    existing_expense_refs = {
        row.bank_ref
        for row in db.query(Transaction.bank_ref)
        .join(Envelope, Transaction.envelope_id == Envelope.id)
        .filter(
            Envelope.household_id == household_id,
            Transaction.bank_ref.in_({t.bank_ref for t in tx_items}),
            Transaction.bank_ref.isnot(None),
            Transaction.deleted_at.is_(None),
        )
        .all()
    }
    tx_items = [t for t in tx_items if t.bank_ref not in existing_expense_refs]

    for item in tx_items:
        db.add(Transaction(
            envelope_id=item.envelope_id,
            amount=item.amount,
            type=item.type,
            date=item.date,
            note=item.note,
            bank_ref=item.bank_ref,
        ))

    income_recorded = 0
    for item in income_items:
        new_month = (item.budget_month or item.date).replace(day=1)
        existing = None
        if item.bank_ref:
            existing = db.query(Income).filter_by(
                household_id=household_id, bank_ref=item.bank_ref, is_estimate=False
            ).first()
        if not existing:
            # Match manually-added real income (no bank_ref) by amount + month, never estimates
            existing = db.query(Income).filter_by(
                household_id=household_id, amount=item.amount,
                month=item.date.replace(day=1), is_estimate=False
            ).first()
        if existing:
            existing.month = new_month  # re-budget to the requested month
        else:
            db.query(Income).filter_by(
                household_id=household_id, month=new_month, is_estimate=True
            ).delete(synchronize_session=False)
            db.add(Income(
                household_id=household_id,
                amount=item.amount,
                source=item.note,
                date=item.date,
                month=new_month,
                bank_ref=item.bank_ref,
            ))
        income_recorded += 1

    db.commit()
    return ImportConfirmResponse(imported=len(tx_items), income_recorded=income_recorded)


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _parse_ofx(content: bytes) -> tuple[list[ParsedTransaction], list[str]]:
    try:
        from ofxparse import OfxParser
    except ImportError:
        raise HTTPException(500, "ofxparse library not installed")

    transactions: list[ParsedTransaction] = []
    errors: list[str] = []

    try:
        ofx = OfxParser.parse(io.BytesIO(content))
        accounts = ofx.accounts if hasattr(ofx, "accounts") else [ofx.account] if ofx.account else []
        for account in accounts:
            for tx in account.statement.transactions:
                try:
                    amount = Decimal(str(tx.amount))
                    tx_type = "credit" if amount >= 0 else "debit"
                    tx_date = tx.date.date() if hasattr(tx.date, "date") else tx.date
                    description = (tx.memo or tx.payee or "").strip()
                    bank_ref = str(getattr(tx, "id", "") or _fingerprint(tx_date, abs(amount), description))
                    transactions.append(ParsedTransaction(
                        id=str(uuid.uuid4()),
                        date=tx_date,
                        description=description,
                        amount=abs(amount),
                        type=tx_type,
                        bank_ref=bank_ref,
                    ))
                except Exception as e:
                    errors.append(f"Skipped row: {e}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse OFX/QFX file: {e}")

    return transactions, errors


def _parse_csv(content: bytes) -> tuple[list[ParsedTransaction], list[str]]:
    # Decode handling BOM and common encodings
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(422, "Could not decode CSV file")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(422, "CSV file appears empty or has no headers")

    headers = {h.lower().strip(): h for h in reader.fieldnames}

    date_col = _find_col(headers, ["date", "transaction date", "trans date", "posted date", "trans_date"])
    desc_col = _find_col(headers, ["description", "memo", "name", "payee", "transaction description", "narrative"])
    amount_col = _find_col(headers, ["amount", "trnamt", "transaction amount"])
    debit_col = _find_col(headers, ["debit", "debit amount", "withdrawal", "withdrawals"])
    credit_col = _find_col(headers, ["credit", "credit amount", "deposit", "deposits"])

    if not date_col:
        raise HTTPException(422, "Could not find a date column in CSV. Expected a column named 'Date' or 'Transaction Date'.")
    if not desc_col:
        raise HTTPException(422, "Could not find a description column in CSV. Expected 'Description', 'Memo', or 'Payee'.")
    if not amount_col and not (debit_col or credit_col):
        raise HTTPException(422, "Could not find an amount column in CSV. Expected 'Amount', 'Debit', or 'Credit'.")

    transactions: list[ParsedTransaction] = []
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        try:
            raw_date = row[date_col].strip()
            if not raw_date:
                continue
            parsed_date = dateparser.parse(raw_date, dayfirst=False).date()
            description = row[desc_col].strip()

            if amount_col:
                raw = row[amount_col].replace(",", "").replace("$", "").strip()
                if not raw:
                    continue
                amount = Decimal(raw)
                tx_type = "credit" if amount >= 0 else "debit"
                amount = abs(amount)
            else:
                debit_raw = (row.get(debit_col) or "").replace(",", "").replace("$", "").strip()
                credit_raw = (row.get(credit_col) or "").replace(",", "").replace("$", "").strip()
                if debit_raw:
                    amount = abs(Decimal(debit_raw))
                    tx_type = "debit"
                elif credit_raw:
                    amount = abs(Decimal(credit_raw))
                    tx_type = "credit"
                else:
                    continue

            if amount == 0:
                continue

            transactions.append(ParsedTransaction(
                id=str(uuid.uuid4()),
                date=parsed_date,
                description=description,
                amount=amount,
                type=tx_type,
                bank_ref=_fingerprint(parsed_date, amount, description),
            ))
        except (InvalidOperation, ValueError) as e:
            errors.append(f"Row {i}: {e}")

    return transactions, errors


def _fingerprint(tx_date: date, amount: Decimal, description: str) -> str:
    raw = f"{tx_date}|{amount}|{description.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _find_col(headers: dict[str, str], candidates: list[str]) -> str | None:
    for c in candidates:
        if c in headers:
            return headers[c]
    return None
