import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "postgresql://envelope_user:password@localhost:5432/envelope_test_db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def clean_db():
    """Truncate all tables before each test for isolation."""
    with engine.connect() as conn:
        conn.execute(text(
            "TRUNCATE transactions, periods, envelopes, "
            "household_members, households, refresh_tokens, users"
        ))
        conn.commit()
    yield


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


# ---------------------------------------------------------------------------
# Shared helper functions (not fixtures) — import these in test files
# ---------------------------------------------------------------------------

def register(client, email="user@test.com", password="Secret123!"):
    return client.post("/auth/register", json={"email": email, "password": password})


def login(client, email="user@test.com", password="Secret123!"):
    return client.post("/auth/login", json={"email": email, "password": password})


def auth_header(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


# ---------------------------------------------------------------------------
# Shared fixtures for common test objects
# ---------------------------------------------------------------------------

@pytest.fixture
def user_tokens(client):
    return register(client).json()


@pytest.fixture
def headers(user_tokens):
    return auth_header(user_tokens["access_token"])


@pytest.fixture
def household(client, headers):
    r = client.post("/households", json={"name": "Test Budget"}, headers=headers)
    assert r.status_code == 201
    return r.json()


@pytest.fixture
def envelope(client, headers, household):
    r = client.post(
        f"/households/{household['id']}/envelopes",
        json={"name": "Groceries"},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()


@pytest.fixture
def period(client, headers, household, envelope):
    r = client.post(
        f"/households/{household['id']}/envelopes/{envelope['id']}/periods",
        json={"month": "2026-05-01", "allocated": "500.00"},
        headers=headers,
    )
    assert r.status_code == 201
    return r.json()
