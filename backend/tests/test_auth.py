"""
Tests for authentication endpoints: register, login, get current user.
"""

import pytest
from fastapi.testclient import TestClient


class TestRegister:
    """Tests for POST /api/auth/register"""

    def test_register_success(self, client: TestClient, test_user_data: dict):
        """User can register with valid data."""
        response = client.post("/api/auth/register", json=test_user_data)
        assert response.status_code == 201

        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert data["data"]["user"]["name"] == test_user_data["name"]
        assert data["data"]["user"]["email"] == test_user_data["email"]
        assert "password" not in data["data"]["user"]
        assert "password_hash" not in data["data"]["user"]

    def test_register_duplicate_email(
        self, client: TestClient, test_user_data: dict
    ):
        """Registration with an existing email should fail."""
        # First registration
        client.post("/api/auth/register", json=test_user_data)

        # Duplicate registration
        response = client.post("/api/auth/register", json=test_user_data)
        assert response.status_code == 409
        assert response.json()["success"] is False

    def test_register_invalid_email(self, client: TestClient):
        """Registration with invalid email should fail."""
        response = client.post(
            "/api/auth/register",
            json={
                "name": "Test",
                "email": "not-an-email",
                "password": "password123",
            },
        )
        assert response.status_code == 422
        assert response.json()["success"] is False

    def test_register_short_password(self, client: TestClient):
        """Registration with a password shorter than 6 chars should fail."""
        response = client.post(
            "/api/auth/register",
            json={
                "name": "Test",
                "email": "test@example.com",
                "password": "abc",
            },
        )
        assert response.status_code == 422

    def test_register_missing_name(self, client: TestClient):
        """Registration without a name should fail."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "test@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 422


class TestLogin:
    """Tests for POST /api/auth/login"""

    def test_login_success(
        self, client: TestClient, test_user_data: dict
    ):
        """User can login with correct credentials."""
        # Register first
        client.post("/api/auth/register", json=test_user_data)

        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_data["email"],
                "password": test_user_data["password"],
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert data["data"]["user"]["email"] == test_user_data["email"]

    def test_login_wrong_password(
        self, client: TestClient, test_user_data: dict
    ):
        """Login with wrong password should fail."""
        client.post("/api/auth/register", json=test_user_data)

        response = client.post(
            "/api/auth/login",
            json={
                "email": test_user_data["email"],
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401
        assert response.json()["success"] is False

    def test_login_nonexistent_email(self, client: TestClient):
        """Login with a non-existent email should fail."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nobody@example.com",
                "password": "password123",
            },
        )
        assert response.status_code == 401


class TestGetMe:
    """Tests for GET /api/auth/me"""

    def test_get_me_success(
        self, client: TestClient, auth_headers: dict, test_user_data: dict
    ):
        """Authenticated user can retrieve their profile."""
        response = client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["data"]["name"] == test_user_data["name"]
        assert data["data"]["email"] == test_user_data["email"]

    def test_get_me_no_token(self, client: TestClient):
        """Request without token should return 403."""
        response = client.get("/api/auth/me")
        assert response.status_code == 403

    def test_get_me_invalid_token(self, client: TestClient):
        """Request with invalid token should return 401."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid-token-here"},
        )
        assert response.status_code == 401


class TestGoogleAuth:
    """Tests for POST /api/auth/google"""

    def test_google_auth_new_user(self, client: TestClient):
        """Google OAuth registers and authenticates a new user."""
        response = client.post(
            "/api/auth/google",
            json={
                "email": "google.user@gmail.com",
                "name": "Google User",
                "google_id": "google_123456",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert data["data"]["user"]["email"] == "google.user@gmail.com"
        assert data["data"]["user"]["name"] == "Google User"

    def test_google_auth_existing_user(
        self, client: TestClient, test_user_data: dict
    ):
        """Google OAuth authenticates an existing registered user."""
        # Register user with password first
        client.post("/api/auth/register", json=test_user_data)

        # Login with Google OAuth using same email
        response = client.post(
            "/api/auth/google",
            json={
                "email": test_user_data["email"],
                "name": test_user_data["name"],
                "google_id": "google_987654",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]
        assert data["data"]["user"]["email"] == test_user_data["email"]
