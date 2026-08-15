"""
Pytest fixtures for the Plantify backend test suite.

Uses an in-memory SQLite database for testing (no PostgreSQL dependency).
Creates a fresh database for each test function.
"""

import os
import uuid
import pytest
from typing import Generator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

# Override settings BEFORE importing app modules
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "60"
os.environ["UPLOAD_DIR"] = "test_uploads"
os.environ["CLIENT_URL"] = "http://localhost:3000"

from app.models.base import Base
from app.config.database import get_db
from app.main import app
from app.services.auth_service import AuthService


# SQLite test engine (in-memory)
test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable FK support in SQLite (off by default)."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Provide a transactional database session for a test."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> TestClient:
    """
    Provide a FastAPI TestClient with the database session overridden.
    """

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user_data() -> dict:
    """Sample user registration data."""
    return {
        "name": "Test User",
        "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
        "password": "securepassword123",
    }


@pytest.fixture
def registered_user(client: TestClient, test_user_data: dict) -> dict:
    """Register a user and return the response data (includes token)."""
    response = client.post("/api/auth/register", json=test_user_data)
    assert response.status_code == 201
    return response.json()["data"]


@pytest.fixture
def auth_headers(registered_user: dict) -> dict:
    """Authorization headers with a valid JWT token."""
    token = registered_user["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_plant_data() -> dict:
    """Sample plant creation data."""
    return {
        "name": "Snake Plant",
        "scientific_name": "Sansevieria trifasciata",
        "identification_confidence": 95.5,
    }


@pytest.fixture
def created_plant(
    client: TestClient, auth_headers: dict, test_plant_data: dict
) -> dict:
    """Create a plant and return the response data."""
    response = client.post(
        "/api/plants", json=test_plant_data, headers=auth_headers
    )
    assert response.status_code == 201
    return response.json()["data"]
