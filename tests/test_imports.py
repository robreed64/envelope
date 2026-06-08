import hashlib
from decimal import Decimal


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _csv(rows: list[tuple]) -> bytes:
    lines = ["Date,Description,Amount"] + [f"{d},{desc},{amt}" for d, desc, amt in rows]
    return "\n".join(lines).encode()


def _fingerprint(tx_date: str, amount: str, description: str) -> str:
    raw = f"{tx_date}|{amount}|{description.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _preview(client, headers, household, content, filename="transactions.csv"):
    return client.post(
        f"/households/{household['id']}/import/preview",
        files={"file": (filename, content, "text/csv")},
        headers=headers,
    )


def _confirm(client, headers, household, transactions, account_name="Test Bank"):
    return client.post(
        f"/households/{household['id']}/import/confirm",
        json={"transactions": transactions, "account_name": account_name},
        headers=headers,
    )


def _to_confirm_item(tx, envelope_id):
    return {
        "date": tx["date"],
        "amount": tx["amount"],
        "type": tx["type"],
        "note": tx["description"],
        "bank_ref": tx["bank_ref"],
        "envelope_id": envelope_id,
    }


# ---------------------------------------------------------------------------
# Preview — CSV parsing
# ---------------------------------------------------------------------------

def test_preview_csv_parses_transactions(client, headers, household):
    content = _csv([("2026-05-01", "Grocery Store", "-45.00"), ("2026-05-02", "Restaurant", "-25.50")])
    r = _preview(client, headers, household, content)
    assert r.status_code == 200
    body = r.json()
    assert len(body["transactions"]) == 2
    assert body["parse_errors"] == []
    assert body["detected_account"] is None


def test_preview_csv_debit_and_credit_types(client, headers, household):
    content = _csv([("2026-05-01", "Grocery Store", "-45.00"), ("2026-05-02", "Paycheck", "2000.00")])
    txs = _preview(client, headers, household, content).json()["transactions"]
    types = {t["description"]: t["type"] for t in txs}
    assert types["Grocery Store"] == "debit"
    assert types["Paycheck"] == "credit"


def test_preview_csv_amounts_are_positive(client, headers, household):
    content = _csv([("2026-05-01", "Gas", "-60.00")])
    txs = _preview(client, headers, household, content).json()["transactions"]
    assert Decimal(txs[0]["amount"]) == Decimal("60.00")


def test_preview_csv_marks_duplicates_after_import(client, headers, household, envelope):
    content = _csv([("2026-05-01", "Grocery Store", "-45.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]

    # confirm the import
    _confirm(client, headers, household, [_to_confirm_item(preview[0], envelope["id"])])

    # preview the same file again — should be marked duplicate
    r = _preview(client, headers, household, content)
    txs = r.json()["transactions"]
    assert txs[0]["duplicate"] is True


def test_preview_csv_new_transactions_not_duplicate(client, headers, household):
    content = _csv([("2026-05-01", "New Purchase", "-99.00")])
    txs = _preview(client, headers, household, content).json()["transactions"]
    assert txs[0]["duplicate"] is False


def test_preview_csv_missing_date_column_returns_422(client, headers, household):
    content = b"Description,Amount\nGroceries,-45.00\n"
    r = _preview(client, headers, household, content)
    assert r.status_code == 422


def test_preview_csv_missing_description_column_returns_422(client, headers, household):
    content = b"Date,Amount\n2026-05-01,-45.00\n"
    r = _preview(client, headers, household, content)
    assert r.status_code == 422


def test_preview_csv_missing_amount_column_returns_422(client, headers, household):
    content = b"Date,Description\n2026-05-01,Groceries\n"
    r = _preview(client, headers, household, content)
    assert r.status_code == 422


def test_preview_csv_marks_credit_as_already_income(client, headers, household):
    # Add income for the same amount+month first
    client.post(
        f"/households/{household['id']}/income",
        json={"amount": "2000.00", "source": "Salary", "date": "2026-05-01"},
        headers=headers,
    )
    content = _csv([("2026-05-01", "Paycheck", "2000.00")])
    txs = _preview(client, headers, household, content).json()["transactions"]
    assert txs[0]["already_income"] is True


def test_viewer_cannot_preview(client, headers, household):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    content = _csv([("2026-05-01", "Gas", "-40.00")])
    r = _preview(client, vh, household, content)
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Confirm — import
# ---------------------------------------------------------------------------

def test_confirm_import_creates_transactions(client, headers, household, envelope):
    content = _csv([("2026-05-01", "Gas", "-40.00"), ("2026-05-02", "Supermarket", "-85.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]

    r = _confirm(client, headers, household, [_to_confirm_item(t, envelope["id"]) for t in preview])
    assert r.status_code == 200
    assert r.json()["imported"] == 2
    assert r.json()["income_recorded"] == 0


def test_confirm_import_deduplicates_on_second_call(client, headers, household, envelope):
    content = _csv([("2026-05-01", "Gas", "-40.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    items = [_to_confirm_item(preview[0], envelope["id"])]

    _confirm(client, headers, household, items)
    r = _confirm(client, headers, household, items)
    assert r.status_code == 200
    assert r.json()["imported"] == 0


def test_confirm_income_item_creates_income_record(client, headers, household):
    content = _csv([("2026-05-10", "Paycheck", "3200.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    tx = preview[0]

    item = {
        "date": tx["date"],
        "amount": tx["amount"],
        "type": tx["type"],
        "note": tx["description"],
        "bank_ref": tx["bank_ref"],
        "is_income": True,
    }
    r = _confirm(client, headers, household, [item])
    assert r.status_code == 200
    assert r.json()["income_recorded"] == 1

    income = client.get(f"/households/{household['id']}/income?month=2026-05-01", headers=headers).json()
    assert len(income) == 1
    assert Decimal(income[0]["amount"]) == Decimal("3200.00")


def test_confirm_income_not_duplicated_on_second_import(client, headers, household):
    content = _csv([("2026-05-10", "Paycheck", "3200.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    tx = preview[0]
    item = {"date": tx["date"], "amount": tx["amount"], "type": tx["type"],
            "note": tx["description"], "bank_ref": tx["bank_ref"], "is_income": True}

    _confirm(client, headers, household, [item])
    r = _confirm(client, headers, household, [item])
    assert r.status_code == 200

    income = client.get(f"/households/{household['id']}/income?month=2026-05-01", headers=headers).json()
    assert len(income) == 1


def test_confirm_invalid_envelope_returns_400(client, headers, household):
    import uuid
    content = _csv([("2026-05-01", "Gas", "-40.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    item = _to_confirm_item(preview[0], str(uuid.uuid4()))

    r = _confirm(client, headers, household, [item])
    assert r.status_code == 400


def test_confirm_creates_account_from_name(client, headers, household, envelope):
    content = _csv([("2026-05-01", "Gas", "-40.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    items = [_to_confirm_item(preview[0], envelope["id"])]

    _confirm(client, headers, household, items, account_name="Chase Checking")

    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    assert any(a["bank_name"] == "Chase Checking" for a in accounts)


def test_confirm_reuses_existing_account(client, headers, household, envelope):
    # Create account manually first
    acct = client.post(
        f"/households/{household['id']}/accounts",
        json={"bank_name": "Chase Checking"},
        headers=headers,
    ).json()

    content = _csv([("2026-05-01", "Gas", "-40.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    _confirm(client, headers, household, [_to_confirm_item(preview[0], envelope["id"])], account_name="Chase Checking")

    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    matching = [a for a in accounts if a["bank_name"] == "Chase Checking"]
    assert len(matching) == 1
    assert matching[0]["id"] == acct["id"]


def test_viewer_cannot_confirm(client, headers, household, envelope):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    content = _csv([("2026-05-01", "Gas", "-40.00")])
    preview = _preview(client, headers, household, content).json()["transactions"]
    r = _confirm(client, vh, household, [_to_confirm_item(preview[0], envelope["id"])])
    assert r.status_code == 403
