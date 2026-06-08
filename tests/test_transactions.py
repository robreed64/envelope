from decimal import Decimal


def _tx_url(household, envelope):
    return f"/households/{household['id']}/envelopes/{envelope['id']}/transactions"


def test_create_debit_transaction(client, headers, household, envelope):
    r = client.post(
        _tx_url(household, envelope),
        json={"amount": "45.00", "type": "debit", "date": "2026-05-05", "note": "Supermarket"},
        headers=headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["type"] == "debit"
    assert Decimal(body["amount"]) == Decimal("45.00")
    assert body["note"] == "Supermarket"


def test_create_credit_transaction(client, headers, household, envelope):
    r = client.post(
        _tx_url(household, envelope),
        json={"amount": "20.00", "type": "credit", "date": "2026-05-06"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["type"] == "credit"


def test_list_transactions(client, headers, household, envelope):
    client.post(_tx_url(household, envelope), json={"amount": "10.00", "type": "debit", "date": "2026-05-01"}, headers=headers)
    client.post(_tx_url(household, envelope), json={"amount": "20.00", "type": "debit", "date": "2026-05-02"}, headers=headers)

    r = client.get(_tx_url(household, envelope), headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_soft_delete_hides_transaction(client, headers, household, envelope):
    tx = client.post(
        _tx_url(household, envelope),
        json={"amount": "30.00", "type": "debit", "date": "2026-05-03"},
        headers=headers,
    ).json()

    client.delete(f"{_tx_url(household, envelope)}/{tx['id']}", headers=headers)

    r = client.get(_tx_url(household, envelope), headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_soft_deleted_transaction_not_counted_in_balance(client, headers, household, envelope, period):
    tx = client.post(
        _tx_url(household, envelope),
        json={"amount": "100.00", "type": "debit", "date": "2026-05-08"},
        headers=headers,
    ).json()
    client.delete(f"{_tx_url(household, envelope)}/{tx['id']}", headers=headers)

    r = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        headers=headers,
    )
    p = r.json()[0]
    assert Decimal(p["spent"]) == Decimal("0.00")


def test_transfer_creates_debit_and_credit_pair(client, headers, household):
    env_a = client.post(f"/households/{household['id']}/envelopes", json={"name": "Rent"}, headers=headers).json()
    env_b = client.post(f"/households/{household['id']}/envelopes", json={"name": "Buffer"}, headers=headers).json()

    r = client.post(
        f"/households/{household['id']}/transfers",
        json={
            "from_envelope_id": env_a["id"],
            "to_envelope_id": env_b["id"],
            "amount": "50.00",
            "date": "2026-05-10",
        },
        headers=headers,
    )
    assert r.status_code == 201
    pair = r.json()
    assert len(pair) == 2
    envelope_ids = {tx["envelope_id"] for tx in pair}
    assert env_a["id"] in envelope_ids
    assert env_b["id"] in envelope_ids


def test_transfer_pair_shares_transfer_id(client, headers, household):
    env_a = client.post(f"/households/{household['id']}/envelopes", json={"name": "A"}, headers=headers).json()
    env_b = client.post(f"/households/{household['id']}/envelopes", json={"name": "B"}, headers=headers).json()

    pair = client.post(
        f"/households/{household['id']}/transfers",
        json={"from_envelope_id": env_a["id"], "to_envelope_id": env_b["id"], "amount": "25.00", "date": "2026-05-11"},
        headers=headers,
    ).json()

    assert pair[0]["transfer_id"] == pair[1]["transfer_id"]
    assert pair[0]["transfer_id"] is not None


def test_transfer_type_rejected_on_transaction_endpoint(client, headers, household, envelope):
    r = client.post(
        _tx_url(household, envelope),
        json={"amount": "10.00", "type": "transfer", "date": "2026-05-12"},
        headers=headers,
    )
    assert r.status_code == 400


def test_viewer_cannot_delete_transaction(client, headers, household, envelope):
    from tests.conftest import auth_header, register

    tx = client.post(
        _tx_url(household, envelope),
        json={"amount": "50.00", "type": "debit", "date": "2026-05-05"},
        headers=headers,
    ).json()

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(
        f"/households/{household['id']}/members",
        json={"email": "viewer@test.com", "role": "viewer"},
        headers=headers,
    )

    r = client.delete(f"{_tx_url(household, envelope)}/{tx['id']}", headers=vh)
    assert r.status_code == 403
