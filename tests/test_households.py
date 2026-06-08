from tests.conftest import auth_header, register


def test_create_household(client, headers):
    r = client.post("/households", json={"name": "Family Budget"}, headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Family Budget"
    assert "id" in body


def test_creator_is_added_as_owner_member(client, headers, household):
    # Owner can invite others — only owners can do this, so if this works, owner role was set
    r = client.post(
        f"/households/{household['id']}/members",
        json={"email": "anyone@test.com", "role": "viewer"},
        headers=headers,
    )
    # 404 because user doesn't exist, but NOT 403 — confirms owner role
    assert r.status_code == 404


def test_list_returns_only_current_users_households(client):
    alice_h = auth_header(register(client, "alice@test.com").json()["access_token"])
    bob_h = auth_header(register(client, "bob@test.com").json()["access_token"])

    client.post("/households", json={"name": "Alice's Budget"}, headers=alice_h)
    client.post("/households", json={"name": "Bob's Budget"}, headers=bob_h)

    r = client.get("/households", headers=alice_h)
    assert r.status_code == 200
    names = [h["name"] for h in r.json()]
    assert "Alice's Budget" in names
    assert "Bob's Budget" not in names


def test_invite_member_as_owner(client, headers, household):
    register(client, "invite@test.com")
    r = client.post(
        f"/households/{household['id']}/members",
        json={"email": "invite@test.com", "role": "editor"},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["role"] == "editor"


def test_invite_nonexistent_user_returns_404(client, headers, household):
    r = client.post(
        f"/households/{household['id']}/members",
        json={"email": "ghost@test.com", "role": "viewer"},
        headers=headers,
    )
    assert r.status_code == 404


def test_invite_already_member_returns_409(client, headers, household):
    register(client, "member@test.com")
    client.post(
        f"/households/{household['id']}/members",
        json={"email": "member@test.com", "role": "viewer"},
        headers=headers,
    )
    r = client.post(
        f"/households/{household['id']}/members",
        json={"email": "member@test.com", "role": "editor"},
        headers=headers,
    )
    assert r.status_code == 409


def test_viewer_cannot_invite_returns_403(client, headers, household):
    viewer_tokens = register(client, "viewer@test.com").json()
    vh = auth_header(viewer_tokens["access_token"])

    client.post(
        f"/households/{household['id']}/members",
        json={"email": "viewer@test.com", "role": "viewer"},
        headers=headers,
    )

    register(client, "target@test.com")
    r = client.post(
        f"/households/{household['id']}/members",
        json={"email": "target@test.com", "role": "viewer"},
        headers=vh,
    )
    assert r.status_code == 403


def test_unauthenticated_cannot_create_household(client):
    r = client.post("/households", json={"name": "Sneaky"})
    assert r.status_code == 403
