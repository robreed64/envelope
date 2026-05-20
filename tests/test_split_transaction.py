import uuid
from decimal import Decimal

from app.models.transaction import Transaction


def _tx_url(household, envelope):
    return f"/households/{household['id']}/envelopes/{envelope['id']}/transactions"


def _split_url(household, tx_id):
    return f"/households/{household['id']}/transactions/{tx_id}/split"


def _create_tx(client, headers, household, envelope, amount="100.00", note="Capital One Payment"):
    r = client.post(
        _tx_url(household, envelope),
        json={"amount": amount, "type": "debit", "date": "2026-05-10", "note": note},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


def _extra_envelope(client, headers, household, name="Utilities"):
    r = client.post(
        f"/households/{household['id']}/envelopes",
        json={"name": name},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


def test_split_creates_two_legs(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope)
    env_b = _extra_envelope(client, headers, household)

    r = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 60.00, "note": "Food"},
            {"envelope_id": env_b["id"],    "amount": 40.00, "note": "Transport"},
        ]},
        headers=headers,
    )
    assert r.status_code == 201
    legs = r.json()
    assert len(legs) == 2
    amounts = {Decimal(l["amount"]) for l in legs}
    assert amounts == {Decimal("60.00"), Decimal("40.00")}


def test_split_legs_share_split_id(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope)
    env_b = _extra_envelope(client, headers, household)

    legs = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 70.00},
            {"envelope_id": env_b["id"],    "amount": 30.00},
        ]},
        headers=headers,
    ).json()

    split_ids = {l["split_id"] for l in legs}
    assert len(split_ids) == 1
    assert None not in split_ids


def test_split_soft_deletes_original(client, headers, household, envelope, db):
    tx = _create_tx(client, headers, household, envelope)
    env_b = _extra_envelope(client, headers, household)

    client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 50.00},
            {"envelope_id": env_b["id"],    "amount": 50.00},
        ]},
        headers=headers,
    )

    db.expire_all()
    original = db.query(Transaction).filter_by(id=uuid.UUID(tx["id"])).first()
    assert original.deleted_at is not None


def test_split_preserves_type_and_date(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope, amount="80.00")
    env_b = _extra_envelope(client, headers, household)

    legs = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 50.00},
            {"envelope_id": env_b["id"],    "amount": 30.00},
        ]},
        headers=headers,
    ).json()

    for leg in legs:
        assert leg["type"] == "debit"
        assert leg["date"] == "2026-05-10"


def test_split_first_leg_inherits_bank_ref(client, headers, household, envelope, db):
    tx = _create_tx(client, headers, household, envelope)

    # Attach a bank_ref directly — the API doesn't expose this field
    original = db.query(Transaction).filter_by(id=uuid.UUID(tx["id"])).first()
    original.bank_ref = "test-bank-ref-abc"
    db.commit()

    env_b = _extra_envelope(client, headers, household)
    legs = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 60.00},
            {"envelope_id": env_b["id"],    "amount": 40.00},
        ]},
        headers=headers,
    ).json()

    leg_ids = [uuid.UUID(l["id"]) for l in legs]
    db.expire_all()
    db_legs = db.query(Transaction).filter(Transaction.id.in_(leg_ids)).all()
    bank_refs = [l.bank_ref for l in db_legs]
    assert "test-bank-ref-abc" in bank_refs
    assert bank_refs.count(None) == 1


def test_split_amounts_must_equal_original(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope, amount="100.00")
    env_b = _extra_envelope(client, headers, household)

    r = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 60.00},
            {"envelope_id": env_b["id"],    "amount": 35.00},  # 95 != 100
        ]},
        headers=headers,
    )
    assert r.status_code == 400


def test_split_requires_at_least_two_legs(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope)

    r = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [{"envelope_id": envelope["id"], "amount": 100.00}]},
        headers=headers,
    )
    assert r.status_code == 400


def test_split_already_split_leg_rejected(client, headers, household, envelope):
    tx = _create_tx(client, headers, household, envelope)
    env_b = _extra_envelope(client, headers, household)

    legs = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 50.00},
            {"envelope_id": env_b["id"],    "amount": 50.00},
        ]},
        headers=headers,
    ).json()

    # Try to split one of the resulting legs
    r = client.post(
        _split_url(household, legs[0]["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 30.00},
            {"envelope_id": env_b["id"],    "amount": 20.00},
        ]},
        headers=headers,
    )
    assert r.status_code == 400


def test_split_nonexistent_transaction_returns_404(client, headers, household):
    r = client.post(
        _split_url(household, str(uuid.uuid4())),
        json={"legs": [
            {"envelope_id": str(uuid.uuid4()), "amount": 50.00},
            {"envelope_id": str(uuid.uuid4()), "amount": 50.00},
        ]},
        headers=headers,
    )
    assert r.status_code == 404


def test_split_cross_household_transaction_returns_404(client, headers, household, envelope):
    """A transaction from another household cannot be split by this user."""
    from tests.conftest import auth_header, register

    # Create a second user with their own household and transaction
    other_tokens = register(client, "other@test.com").json()
    other_headers = auth_header(other_tokens["access_token"])
    other_household = client.post("/households", json={"name": "Other"}, headers=other_headers).json()
    other_envelope = client.post(
        f"/households/{other_household['id']}/envelopes",
        json={"name": "Food"},
        headers=other_headers,
    ).json()
    other_tx = _create_tx(client, other_headers, other_household, other_envelope)

    # First user tries to split the other household's transaction
    r = client.post(
        _split_url(household, other_tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 50.00},
            {"envelope_id": envelope["id"], "amount": 50.00},
        ]},
        headers=headers,
    )
    assert r.status_code == 404


def test_viewer_cannot_split(client, headers, household, envelope):
    from tests.conftest import auth_header, register

    tx = _create_tx(client, headers, household, envelope)

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(
        f"/households/{household['id']}/members",
        json={"email": "viewer@test.com", "role": "viewer"},
        headers=headers,
    )

    env_b = _extra_envelope(client, headers, household)
    r = client.post(
        _split_url(household, tx["id"]),
        json={"legs": [
            {"envelope_id": envelope["id"], "amount": 50.00},
            {"envelope_id": env_b["id"],    "amount": 50.00},
        ]},
        headers=vh,
    )
    assert r.status_code == 403
