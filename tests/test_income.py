from decimal import Decimal


def _url(household):
    return f"/households/{household['id']}/income"


def test_add_income(client, headers, household):
    r = client.post(_url(household), json={"amount": "3200.00", "source": "Salary", "date": "2026-05-01"}, headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert Decimal(body["amount"]) == Decimal("3200.00")
    assert body["source"] == "Salary"
    assert body["month"] == "2026-05-01"


def test_add_income_defaults_month_to_date(client, headers, household):
    r = client.post(_url(household), json={"amount": "1000.00", "source": "Side job", "date": "2026-05-15"}, headers=headers)
    assert r.status_code == 201
    assert r.json()["month"] == "2026-05-01"


def test_add_income_with_explicit_budget_month(client, headers, household):
    r = client.post(
        _url(household),
        json={"amount": "500.00", "source": "Freelance", "date": "2026-04-30", "budget_month": "2026-05-01"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["month"] == "2026-05-01"


def test_real_income_replaces_estimate_for_same_month(client, headers, household):
    client.post(_url(household), json={"amount": "3000.00", "source": "Est.", "date": "2026-05-01", "is_estimate": True}, headers=headers)
    r = client.post(_url(household), json={"amount": "3200.00", "source": "Salary", "date": "2026-05-10"}, headers=headers)
    assert r.status_code == 201

    listed = client.get(_url(household) + "?month=2026-05-01", headers=headers).json()
    assert len(listed) == 1
    assert Decimal(listed[0]["amount"]) == Decimal("3200.00")


def test_list_income_filtered_by_month(client, headers, household):
    client.post(_url(household), json={"amount": "1000.00", "source": "A", "date": "2026-05-01"}, headers=headers)
    client.post(_url(household), json={"amount": "2000.00", "source": "B", "date": "2026-06-01"}, headers=headers)

    r = client.get(_url(household) + "?month=2026-05-01", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["source"] == "A"


def test_list_income_no_filter_returns_all(client, headers, household):
    client.post(_url(household), json={"amount": "1000.00", "source": "A", "date": "2026-05-01"}, headers=headers)
    client.post(_url(household), json={"amount": "2000.00", "source": "B", "date": "2026-06-01"}, headers=headers)

    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_update_income_amount_and_source(client, headers, household):
    entry = client.post(_url(household), json={"amount": "1000.00", "source": "Old", "date": "2026-05-01"}, headers=headers).json()

    r = client.patch(f"{_url(household)}/{entry['id']}", json={"amount": "1500.00", "source": "New"}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert Decimal(body["amount"]) == Decimal("1500.00")
    assert body["source"] == "New"


def test_update_income_budget_month(client, headers, household):
    entry = client.post(_url(household), json={"amount": "1000.00", "source": "X", "date": "2026-05-01"}, headers=headers).json()

    r = client.patch(f"{_url(household)}/{entry['id']}", json={"budget_month": "2026-06-01"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["month"] == "2026-06-01"


def test_delete_income(client, headers, household):
    entry = client.post(_url(household), json={"amount": "1000.00", "source": "X", "date": "2026-05-01"}, headers=headers).json()

    r = client.delete(f"{_url(household)}/{entry['id']}", headers=headers)
    assert r.status_code == 204

    listed = client.get(_url(household), headers=headers).json()
    assert listed == []


def test_delete_income_not_found(client, headers, household):
    import uuid
    r = client.delete(f"{_url(household)}/{uuid.uuid4()}", headers=headers)
    assert r.status_code == 404


def test_viewer_cannot_add_income(client, headers, household):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.post(_url(household), json={"amount": "1000.00", "source": "X", "date": "2026-05-01"}, headers=vh)
    assert r.status_code == 403


def test_viewer_cannot_delete_income(client, headers, household):
    from tests.conftest import auth_header, register

    entry = client.post(_url(household), json={"amount": "1000.00", "source": "X", "date": "2026-05-01"}, headers=headers).json()

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.delete(f"{_url(household)}/{entry['id']}", headers=vh)
    assert r.status_code == 403
