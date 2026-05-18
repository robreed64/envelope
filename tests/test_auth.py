from tests.conftest import auth_header, login, register


def test_register_returns_access_and_refresh_tokens(client):
    r = register(client)
    assert r.status_code == 201
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["token_type"] == "bearer"


def test_register_duplicate_email_returns_409(client):
    register(client)
    r = register(client)
    assert r.status_code == 409


def test_login_with_valid_credentials(client):
    register(client)
    r = login(client)
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_wrong_password_returns_401(client):
    register(client)
    r = login(client, password="wrongpassword")
    assert r.status_code == 401


def test_login_unknown_email_returns_401(client):
    r = login(client, email="nobody@test.com")
    assert r.status_code == 401


def test_refresh_returns_new_token_pair(client):
    tokens = register(client).json()
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    body = r.json()
    assert "access_token" in body
    assert "refresh_token" in body
    # new tokens should differ from originals
    assert body["access_token"] != tokens["access_token"]


def test_refresh_token_rotation_rejects_old_token(client):
    tokens = register(client).json()
    old_refresh = tokens["refresh_token"]

    # use the refresh token once
    client.post("/auth/refresh", json={"refresh_token": old_refresh})

    # second use of the same token should fail
    r = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 401


def test_logout_revokes_refresh_token(client):
    tokens = register(client).json()
    client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})

    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_protected_route_without_token_returns_401(client):
    r = client.get("/households")
    assert r.status_code == 403  # HTTPBearer returns 403 when no credentials


def test_protected_route_with_invalid_token_returns_401(client):
    r = client.get("/households", headers=auth_header("not.a.valid.token"))
    assert r.status_code == 401
