from decimal import Decimal


def test_create_period(client, headers, household, envelope):
    r = client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json={"month": "2026-05-01", "allocated": "300.00"},
        headers=headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["allocated"] == "300.00"
    assert body["month"] == "2026-05-01"


def test_month_is_normalized_to_first_of_month(client, headers, household, envelope):
    r = client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json={"month": "2026-05-15", "allocated": "200.00"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["month"] == "2026-05-01"


def test_duplicate_period_updates_allocation(client, headers, household, envelope):
    payload = {"month": "2026-06-01", "allocated": "100.00"}
    client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json=payload,
        headers=headers,
    )
    r = client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json={"month": "2026-06-01", "allocated": "200.00"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["allocated"] == "200.00"


def test_new_period_starts_with_zero_spent(client, headers, household, envelope, period):
    r = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        headers=headers,
    )
    assert r.status_code == 200
    p = r.json()[0]
    assert Decimal(p["spent"]) == Decimal("0.00")
    assert Decimal(p["balance"]) == Decimal(p["allocated"])


def test_balance_decreases_with_debits(client, headers, household, envelope, period):
    client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": "120.50", "type": "debit", "date": "2026-05-10"},
        headers=headers,
    )
    r = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        headers=headers,
    )
    p = r.json()[0]
    assert Decimal(p["spent"]) == Decimal("120.50")
    assert Decimal(p["balance"]) == Decimal(p["allocated"]) - Decimal("120.50")


def test_debits_outside_period_month_not_counted(client, headers, household, envelope, period):
    # Transaction in a different month should not affect this period's balance
    client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": "99.00", "type": "debit", "date": "2026-04-30"},
        headers=headers,
    )
    r = client.get(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        headers=headers,
    )
    p = r.json()[0]
    assert Decimal(p["spent"]) == Decimal("0.00")
