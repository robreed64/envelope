from datetime import date


def _url(household):
    return f"/households/{household['id']}/notifications"


def _current_month():
    return date.today().replace(day=1).isoformat()


def _this_month_day(day=15):
    today = date.today()
    return today.replace(day=min(day, 28)).isoformat()


def _make_period(client, headers, household, envelope, allocated="500.00"):
    r = client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json={"month": _current_month(), "allocated": allocated},
        headers=headers,
    )
    assert r.status_code in (200, 201)
    return r.json()


def _make_tx(client, headers, household, envelope, amount, tx_type="debit"):
    return client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": amount, "type": tx_type, "date": _this_month_day()},
        headers=headers,
    ).json()


def test_no_alerts_for_empty_household(client, headers, household):
    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["alerts"] == []
    assert body["month"] == _current_month()


def test_no_budget_alert_when_envelope_has_no_period(client, headers, household, envelope):
    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    alerts = r.json()["alerts"]
    assert len(alerts) == 1
    assert alerts[0]["type"] == "no_budget"
    assert alerts[0]["severity"] == "low"
    assert alerts[0]["envelope_id"] == envelope["id"]


def test_no_alert_when_spending_is_low(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="500.00")
    _make_tx(client, headers, household, envelope, "100.00")  # 20% — under threshold

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    assert alerts == []


def test_near_limit_alert_at_80_percent(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "80.00")  # exactly 80%

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    assert len(alerts) == 1
    assert alerts[0]["type"] == "near_limit"
    assert alerts[0]["severity"] == "medium"
    assert alerts[0]["envelope_id"] == envelope["id"]


def test_near_limit_alert_above_80_percent(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "90.00")

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    assert any(a["type"] == "near_limit" for a in alerts)


def test_over_budget_alert_when_spent_exceeds_allocated(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "120.00")

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    assert len(alerts) == 1
    assert alerts[0]["type"] == "over_budget"
    assert alerts[0]["severity"] == "high"
    assert "over budget" in alerts[0]["message"].lower()


def test_over_budget_takes_priority_over_near_limit(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "150.00")

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    types = {a["type"] for a in alerts}
    assert "over_budget" in types
    assert "near_limit" not in types


def test_credits_reduce_effective_spending(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "90.00", "debit")
    _make_tx(client, headers, household, envelope, "20.00", "credit")  # net 70% — under threshold

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    assert alerts == []


def test_alert_ids_are_stable(client, headers, household, envelope):
    _make_period(client, headers, household, envelope, allocated="100.00")
    _make_tx(client, headers, household, envelope, "120.00")

    r1 = client.get(_url(household), headers=headers).json()["alerts"]
    r2 = client.get(_url(household), headers=headers).json()["alerts"]
    assert r1[0]["id"] == r2[0]["id"]


def test_viewer_can_read_notifications(client, headers, household):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.get(_url(household), headers=vh)
    assert r.status_code == 200


def test_multiple_envelopes_each_produce_independent_alerts(client, headers, household):
    env_a = client.post(f"/households/{household['id']}/envelopes", json={"name": "Rent"}, headers=headers).json()
    env_b = client.post(f"/households/{household['id']}/envelopes", json={"name": "Food"}, headers=headers).json()

    _make_period(client, headers, household, env_a, allocated="1000.00")
    # env_b has no period

    alerts = client.get(_url(household), headers=headers).json()["alerts"]
    types = [a["type"] for a in alerts]
    assert "no_budget" in types
    no_budget = next(a for a in alerts if a["type"] == "no_budget")
    assert no_budget["envelope_id"] == env_b["id"]
