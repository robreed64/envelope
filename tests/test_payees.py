def _url(household):
    return f"/households/{household['id']}/payees"


def _tx(client, headers, household, envelope, note):
    return client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": "10.00", "type": "debit", "date": "2026-05-01", "note": note},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Aliases — upsert / list / delete
# ---------------------------------------------------------------------------

def test_upsert_alias_creates_new(client, headers, household):
    r = client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["alias"] == "Amazon"
    assert r.json()["raw"] == "AMZN*MKTP"


def test_upsert_alias_updates_existing(client, headers, household):
    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    r = client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon Marketplace"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["alias"] == "Amazon Marketplace"


def test_list_aliases(client, headers, household):
    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    client.put(_url(household), json={"raw": "NFLX", "alias": "Netflix"}, headers=headers)

    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    raws = {a["raw"] for a in r.json()}
    assert raws == {"AMZN*MKTP", "NFLX"}


def test_list_aliases_empty(client, headers, household):
    r = client.get(_url(household), headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_delete_alias(client, headers, household):
    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)

    r = client.request("DELETE", _url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    assert r.status_code == 204

    assert client.get(_url(household), headers=headers).json() == []


def test_delete_alias_not_found(client, headers, household):
    r = client.request("DELETE", _url(household), json={"raw": "MISSING", "alias": "X"}, headers=headers)
    assert r.status_code == 404


def test_aliases_are_isolated_per_household(client, headers, household):
    from tests.conftest import auth_header, register

    other_tokens = register(client, "other@test.com").json()
    oh = auth_header(other_tokens["access_token"])
    other_hh = client.post("/households", json={"name": "Other"}, headers=oh).json()

    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    client.put(_url(other_hh), json={"raw": "NFLX", "alias": "Netflix"}, headers=oh)

    aliases = client.get(_url(household), headers=headers).json()
    assert len(aliases) == 1
    assert aliases[0]["raw"] == "AMZN*MKTP"


# ---------------------------------------------------------------------------
# Payee assignments (note → envelope_id)
# ---------------------------------------------------------------------------

def test_payee_assignments_returns_latest_envelope_for_note(client, headers, household, envelope):
    _tx(client, headers, household, envelope, "Grocery Store")
    _tx(client, headers, household, envelope, "Gas Station")

    r = client.get(f"{_url(household)}/assignments", headers=headers)
    assert r.status_code == 200
    assignments = r.json()
    assert assignments["Grocery Store"] == envelope["id"]
    assert assignments["Gas Station"] == envelope["id"]


def test_payee_assignments_empty_when_no_transactions(client, headers, household):
    r = client.get(f"{_url(household)}/assignments", headers=headers)
    assert r.status_code == 200
    assert r.json() == {}


def test_payee_assignments_excludes_transfer_transactions(client, headers, household):
    env_b = client.post(f"/households/{household['id']}/envelopes", json={"name": "Savings"}, headers=headers).json()
    client.post(
        f"/households/{household['id']}/transfers",
        json={"from_envelope_id": household["id"], "to_envelope_id": env_b["id"], "amount": "50.00", "date": "2026-05-01"},
        headers=headers,
    )
    r = client.get(f"{_url(household)}/assignments", headers=headers)
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# Raw notes
# ---------------------------------------------------------------------------

def test_list_raw_notes(client, headers, household, envelope):
    _tx(client, headers, household, envelope, "Grocery Store")
    _tx(client, headers, household, envelope, "Netflix")
    _tx(client, headers, household, envelope, "Grocery Store")  # duplicate — should appear once

    r = client.get(f"{_url(household)}/notes", headers=headers)
    assert r.status_code == 200
    notes = r.json()
    assert notes.count("Grocery Store") == 1
    assert "Netflix" in notes


def test_list_raw_notes_sorted(client, headers, household, envelope):
    _tx(client, headers, household, envelope, "Zebra Store")
    _tx(client, headers, household, envelope, "Apple Market")

    notes = client.get(f"{_url(household)}/notes", headers=headers).json()
    assert notes == sorted(notes)


def test_list_raw_notes_excludes_null_notes(client, headers, household, envelope):
    client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/transactions",
        json={"amount": "10.00", "type": "debit", "date": "2026-05-01"},
        headers=headers,
    )
    notes = client.get(f"{_url(household)}/notes", headers=headers).json()
    assert None not in notes


# ---------------------------------------------------------------------------
# Role checks
# ---------------------------------------------------------------------------

def test_viewer_can_read_aliases(client, headers, household):
    from tests.conftest import auth_header, register

    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.get(_url(household), headers=vh)
    assert r.status_code == 200


def test_viewer_cannot_upsert_alias(client, headers, household):
    from tests.conftest import auth_header, register

    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=vh)
    assert r.status_code == 403


def test_viewer_cannot_delete_alias(client, headers, household):
    from tests.conftest import auth_header, register

    client.put(_url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=headers)
    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])
    client.post(f"/households/{household['id']}/members", json={"email": "viewer@test.com", "role": "viewer"}, headers=headers)

    r = client.request("DELETE", _url(household), json={"raw": "AMZN*MKTP", "alias": "Amazon"}, headers=vh)
    assert r.status_code == 403
