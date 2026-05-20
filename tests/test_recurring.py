import uuid
from decimal import Decimal


def _url(household):
    return f"/households/{household['id']}/recurring"


def _create(client, headers, household, envelope, **kwargs):
    payload = {
        "envelope_id": envelope["id"],
        "name": "Netflix",
        "amount": "15.99",
        "type": "debit",
        "day_of_month": 1,
        **kwargs,
    }
    return client.post(_url(household), json=payload, headers=headers)


def test_create_template(client, headers, household, envelope):
    r = _create(client, headers, household, envelope)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Netflix"
    assert Decimal(body["amount"]) == Decimal("15.99")
    assert body["envelope_name"] == envelope["name"]
    assert body["is_active"] is True


def test_list_templates(client, headers, household, envelope):
    _create(client, headers, household, envelope, name="Netflix")
    _create(client, headers, household, envelope, name="Spotify", amount="9.99")

    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    names = {t["name"] for t in r.json()}
    assert names == {"Netflix", "Spotify"}


def test_list_templates_empty(client, headers, household):
    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_update_template(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope).json()

    r = client.patch(f"{_url(household)}/{tmpl['id']}", json={"amount": "19.99", "day_of_month": 15}, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert Decimal(body["amount"]) == Decimal("19.99")
    assert body["day_of_month"] == 15


def test_update_template_name(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope).json()

    r = client.patch(f"{_url(household)}/{tmpl['id']}", json={"name": "Disney+"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Disney+"


def test_delete_template_soft_deletes(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope).json()

    r = client.delete(f"{_url(household)}/{tmpl['id']}", headers=headers)
    assert r.status_code == 204

    listed = client.get(_url(household), headers=headers).json()
    assert listed == []


def test_delete_template_not_found(client, headers, household):
    r = client.delete(f"{_url(household)}/{uuid.uuid4()}", headers=headers)
    assert r.status_code == 404


def test_apply_template_creates_transaction(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope, amount="15.99", type="debit").json()

    r = client.post(f"{_url(household)}/{tmpl['id']}/apply", json={"date": "2026-05-01"}, headers=headers)
    assert r.status_code == 201
    tx = r.json()
    assert Decimal(tx["amount"]) == Decimal("15.99")
    assert tx["type"] == "debit"
    assert tx["date"] == "2026-05-01"
    assert tx["envelope_id"] == envelope["id"]


def test_apply_template_uses_template_note(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope, name="Netflix", note="Streaming").json()

    tx = client.post(f"{_url(household)}/{tmpl['id']}/apply", json={"date": "2026-05-01"}, headers=headers).json()
    assert tx["note"] == "Streaming"


def test_apply_template_falls_back_to_name_when_no_note(client, headers, household, envelope):
    tmpl = _create(client, headers, household, envelope, name="Netflix").json()

    tx = client.post(f"{_url(household)}/{tmpl['id']}/apply", json={"date": "2026-05-01"}, headers=headers).json()
    assert tx["note"] == "Netflix"


def test_create_template_wrong_envelope_returns_404(client, headers, household):
    r = client.post(
        _url(household),
        json={"envelope_id": str(uuid.uuid4()), "name": "Test", "amount": "10.00", "type": "debit", "day_of_month": 1},
        headers=headers,
    )
    assert r.status_code == 404


def test_suggestions_returns_repeated_transactions(client, headers, household, envelope):
    for _ in range(3):
        client.post(
            f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
            json={"amount": "9.99", "type": "debit", "date": "2026-05-01", "note": "Spotify"},
            headers=headers,
        )

    r = client.get(f"{_url(household)}/suggestions", headers=headers)
    assert r.status_code == 200
    notes = [s["note"] for s in r.json()]
    assert "Spotify" in notes


def test_suggestions_excludes_existing_templates(client, headers, household, envelope):
    for _ in range(3):
        client.post(
            f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
            json={"amount": "9.99", "type": "debit", "date": "2026-05-01", "note": "Spotify"},
            headers=headers,
        )
    _create(client, headers, household, envelope, name="spotify")

    suggestions = client.get(f"{_url(household)}/suggestions", headers=headers).json()
    assert all(s["note"].lower() != "spotify" for s in suggestions)


def test_viewer_cannot_create_template(client, headers, household, envelope):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = _create(client, vh, household, envelope)
    assert r.status_code == 403


def test_viewer_cannot_delete_template(client, headers, household, envelope):
    from tests.conftest import auth_header, register

    tmpl = _create(client, headers, household, envelope).json()
    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.delete(f"{_url(household)}/{tmpl['id']}", headers=vh)
    assert r.status_code == 403
