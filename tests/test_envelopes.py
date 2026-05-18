from tests.conftest import auth_header, register


def test_create_envelope(client, headers, household):
    r = client.post(
        f"/households/{household['id']}/envelopes",
        json={"name": "Rent", "group_name": "Housing", "color": "#ff5733"},
        headers=headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Rent"
    assert body["group_name"] == "Housing"
    assert body["color"] == "#ff5733"
    assert body["is_active"] is True


def test_list_envelopes(client, headers, household, envelope):
    r = client.get(f"/households/{household['id']}/envelopes", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Groceries"


def test_deactivated_envelope_hidden_from_list(client, headers, household, envelope):
    client.patch(
        f"/households/{household['id']}/envelopes/{envelope['id']}",
        json={"is_active": False},
        headers=headers,
    )
    r = client.get(f"/households/{household['id']}/envelopes", headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_update_envelope_name(client, headers, household, envelope):
    r = client.patch(
        f"/households/{household['id']}/envelopes/{envelope['id']}",
        json={"name": "Weekly Groceries"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Weekly Groceries"


def test_editor_can_create_envelope(client, headers, household):
    editor_tokens = register(client, "editor@test.com").json()
    eh = auth_header(editor_tokens["access_token"])

    client.post(
        f"/households/{household['id']}/members",
        json={"email": "editor@test.com", "role": "editor"},
        headers=headers,
    )

    r = client.post(
        f"/households/{household['id']}/envelopes",
        json={"name": "Fuel"},
        headers=eh,
    )
    assert r.status_code == 201


def test_viewer_cannot_create_envelope_returns_403(client, headers, household):
    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])

    client.post(
        f"/households/{household['id']}/members",
        json={"email": "viewer@test.com", "role": "viewer"},
        headers=headers,
    )

    r = client.post(
        f"/households/{household['id']}/envelopes",
        json={"name": "Savings"},
        headers=vh,
    )
    assert r.status_code == 403


def test_non_member_cannot_list_envelopes(client, household):
    outsider_tokens = register(client, "outsider@test.com").json()
    oh = auth_header(outsider_tokens["access_token"])

    r = client.get(f"/households/{household['id']}/envelopes", headers=oh)
    assert r.status_code == 403
