import json
from decimal import Decimal


def _export(client, headers, household, items=None):
    params = {}
    if items:
        params["items"] = ",".join(items)
    return client.get(f"/households/{household['id']}/data/export", params=params, headers=headers)


def _delete(client, headers, household, items):
    return client.delete(
        f"/households/{household['id']}/data/delete",
        params={"items": ",".join(items)},
        headers=headers,
    )


def _restore(client, headers, household, data, items=None):
    params = {}
    if items:
        params["items"] = ",".join(items)
    return client.post(f"/households/{household['id']}/data/restore", json=data, params=params, headers=headers)


def _make_account(client, headers, household, bank_name="Chase", **kwargs):
    return client.post(
        f"/households/{household['id']}/accounts",
        json={"bank_name": bank_name, **kwargs},
        headers=headers,
    ).json()


def _make_tx(client, headers, household, envelope, amount="50.00", note="Gas"):
    return client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": amount, "type": "debit", "date": "2026-05-01", "note": note},
        headers=headers,
    ).json()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def test_export_returns_json_with_metadata(client, headers, household):
    r = _export(client, headers, household)
    assert r.status_code == 200
    body = json.loads(r.content)
    assert body["version"] == 1
    assert "exported_at" in body
    assert body["household_name"] == household["name"]


def test_export_includes_accounts(client, headers, household):
    _make_account(client, headers, household, "Chase", display_name="Chase Checking", account_type="checking")
    body = json.loads(_export(client, headers, household).content)
    assert len(body["accounts"]) == 1
    assert body["accounts"][0]["bank_name"] == "Chase"
    assert body["accounts"][0]["display_name"] == "Chase Checking"


def test_export_includes_account_name_on_transactions(client, headers, household, envelope):
    acct = _make_account(client, headers, household, "Ally")
    # Create transaction via import confirm so it has an account_id
    client.post(
        f"/households/{household['id']}/import/confirm",
        json={
            "transactions": [{
                "date": "2026-05-01", "amount": "40.00", "type": "debit",
                "note": "Gas", "bank_ref": "ref-001",
                "envelope_id": envelope["id"], "account_id": acct["id"],
            }],
        },
        headers=headers,
    )
    body = json.loads(_export(client, headers, household, items=["transactions"]).content)
    tx = body["transactions"][0]
    assert tx["account_name"] == "Ally"


def test_export_transaction_account_name_null_when_no_account(client, headers, household, envelope):
    _make_tx(client, headers, household, envelope)
    body = json.loads(_export(client, headers, household, items=["transactions"]).content)
    assert body["transactions"][0]["account_name"] is None


def test_export_selective_only_returns_requested_items(client, headers, household, envelope):
    body = json.loads(_export(client, headers, household, items=["envelopes"]).content)
    assert "envelopes" in body
    assert "accounts" not in body
    assert "transactions" not in body
    assert "income" not in body


def test_export_unknown_item_returns_400(client, headers, household):
    r = _export(client, headers, household, items=["unknown"])
    assert r.status_code == 400


def test_viewer_can_export(client, headers, household):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = _export(client, vh, household)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def test_restore_creates_accounts(client, headers, household):
    r = _restore(client, headers, household, {
        "accounts": [{"bank_name": "Chase", "display_name": "Chase Checking", "account_type": "checking", "account_id": "1234"}]
    }, items=["accounts"])
    assert r.status_code == 200
    assert r.json()["restored"]["accounts"] == 1

    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    assert any(a["bank_name"] == "Chase" for a in accounts)


def test_restore_skips_duplicate_account_by_bank_name(client, headers, household):
    _make_account(client, headers, household, "Chase")
    r = _restore(client, headers, household, {
        "accounts": [{"bank_name": "Chase", "account_type": "checking"}]
    }, items=["accounts"])
    assert r.json()["restored"]["accounts"] == 0

    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    assert len([a for a in accounts if a["bank_name"] == "Chase"]) == 1


def test_restore_transactions_links_account_id(client, headers, household, envelope):
    backup = {
        "accounts": [{"bank_name": "Ally", "display_name": None, "account_type": "savings", "account_id": None}],
        "envelopes": [],
        "transactions": [{
            "envelope_name": envelope["name"],
            "account_name": "Ally",
            "amount": 55.0, "type": "debit", "date": "2026-05-01",
            "note": "ATM", "bank_ref": "ref-restore-001",
            "transfer_id": None, "split_id": None,
        }],
    }
    _restore(client, headers, household, backup, items=["accounts", "transactions"])

    txs = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        headers=headers,
    ).json()
    assert len(txs) == 1
    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    ally_id = next(a["id"] for a in accounts if a["bank_name"] == "Ally")
    assert txs[0]["account_id"] == ally_id


def test_restore_transactions_account_id_null_when_no_account_name(client, headers, household, envelope):
    backup = {
        "transactions": [{
            "envelope_name": envelope["name"],
            "account_name": None,
            "amount": 20.0, "type": "debit", "date": "2026-05-01",
            "note": "Cash", "bank_ref": "ref-cash-001",
            "transfer_id": None, "split_id": None,
        }],
    }
    _restore(client, headers, household, backup, items=["transactions"])

    txs = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        headers=headers,
    ).json()
    assert txs[0]["account_id"] is None


def test_restore_skips_duplicate_transaction_by_bank_ref(client, headers, household, envelope):
    _make_tx(client, headers, household, envelope)
    # Export then restore the same data
    export_body = json.loads(_export(client, headers, household).content)
    r = _restore(client, headers, household, export_body)
    assert r.json()["restored"].get("transactions", 0) == 0


def test_restore_remaps_transfer_ids(client, headers, household, envelope):
    env_b = client.post(f"/households/{household['id']}/envelopes", json={"name": "Savings"}, headers=headers).json()
    old_tid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    backup = {
        "transactions": [
            {"envelope_name": envelope["name"], "account_name": None, "amount": 30.0, "type": "debit",
             "date": "2026-05-01", "note": "Transfer out", "bank_ref": None,
             "transfer_id": old_tid, "split_id": None},
            {"envelope_name": env_b["name"], "account_name": None, "amount": 30.0, "type": "credit",
             "date": "2026-05-01", "note": "Transfer in", "bank_ref": None,
             "transfer_id": old_tid, "split_id": None},
        ]
    }
    _restore(client, headers, household, backup, items=["transactions"])

    txs_a = client.get(f"/households/{household['id']}/envelopes/{envelope['id']}/transactions", headers=headers).json()
    txs_b = client.get(f"/households/{household['id']}/envelopes/{env_b['id']}/transactions", headers=headers).json()
    assert txs_a[0]["transfer_id"] == txs_b[0]["transfer_id"]
    assert txs_a[0]["transfer_id"] != old_tid


def test_restore_creates_envelopes_if_missing(client, headers, household):
    backup = {
        "envelopes": [{"name": "New Env", "envelope_type": "needs", "rollover": True, "is_protected": False, "sort_order": 1, "periods": []}]
    }
    r = _restore(client, headers, household, backup, items=["envelopes"])
    assert r.json()["restored"]["envelopes"] == 1

    envs = client.get(f"/households/{household['id']}/envelopes", headers=headers).json()
    assert any(e["name"] == "New Env" for e in envs)


def test_non_owner_cannot_restore(client, headers, household):
    from tests.conftest import auth_header, register

    editor_tokens = register(client, "editor@test.com").json()
    eh = auth_header(editor_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "editor@test.com", "role": "editor"}, headers=headers)

    r = _restore(client, eh, household, {})
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_transactions_only(client, headers, household, envelope):
    _make_tx(client, headers, household, envelope)

    r = _delete(client, headers, household, ["transactions"])
    assert r.status_code == 204

    txs = client.get(f"/households/{household['id']}/envelopes/{envelope['id']}/transactions", headers=headers).json()
    assert txs == []
    envs = client.get(f"/households/{household['id']}/envelopes", headers=headers).json()
    assert len(envs) == 1


def test_delete_accounts_nullifies_transaction_account_id(client, headers, household, envelope, db):
    from app.models.transaction import Transaction as TxModel
    import uuid as _uuid

    acct = _make_account(client, headers, household, "Chase")
    tx = client.post(
        f"/households/{household['id']}/import/confirm",
        json={"transactions": [{
            "date": "2026-05-01", "amount": "10.00", "type": "debit",
            "note": "ATM", "bank_ref": "ref-null-test",
            "envelope_id": envelope["id"], "account_id": acct["id"],
        }]},
        headers=headers,
    )

    _delete(client, headers, household, ["accounts"])

    db.expire_all()
    tx_row = db.query(TxModel).filter_by(bank_ref="ref-null-test").first()
    assert tx_row.account_id is None

    accounts = client.get(f"/households/{household['id']}/accounts", headers=headers).json()
    assert accounts == []


def test_delete_income(client, headers, household):
    client.post(f"/households/{household['id']}/income",
                json={"amount": "3000.00", "source": "Salary", "date": "2026-05-01"}, headers=headers)

    r = _delete(client, headers, household, ["income"])
    assert r.status_code == 204

    income = client.get(f"/households/{household['id']}/income", headers=headers).json()
    assert income == []


def test_delete_household_creates_fresh_one(client, headers, household):
    r = _delete(client, headers, household, ["household"])
    assert r.status_code == 204

    new_households = client.get("/households", headers=headers).json()
    ids = [h["id"] for h in new_households]
    assert household["id"] not in ids
    assert any(h["name"] == "My Budget" for h in new_households)


def test_delete_unknown_item_returns_400(client, headers, household):
    r = _delete(client, headers, household, ["unknown"])
    assert r.status_code == 400


def test_non_owner_cannot_delete(client, headers, household):
    from tests.conftest import auth_header, register

    editor_tokens = register(client, "editor@test.com").json()
    eh = auth_header(editor_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "editor@test.com", "role": "editor"}, headers=headers)

    r = _delete(client, eh, household, ["income"])
    assert r.status_code == 403
