"""
Tests for scan creation and retrieval endpoints.
"""

import io
import uuid
import pytest
from fastapi.testclient import TestClient


def create_test_image(
    filename: str = "test_plant.jpg",
    content_type: str = "image/jpeg",
    size: int = 1024,
) -> tuple[str, io.BytesIO, str]:
    """Create a fake image file for upload testing."""
    # Create a minimal JPEG header + padding to simulate a real image
    # JPEG files start with FF D8 FF
    content = b"\xff\xd8\xff\xe0" + b"\x00" * (size - 4)
    return (filename, io.BytesIO(content), content_type)


class TestCreateScan:
    """Tests for POST /api/plants/{plant_id}/scans"""

    def test_create_scan_success(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """Authenticated user can create a scan for their plant."""
        plant_id = created_plant["id"]
        image = create_test_image()

        response = client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": image},
            headers=auth_headers,
        )
        assert response.status_code == 201

        data = response.json()
        assert data["success"] is True
        assert data["data"]["plant_id"] == plant_id
        assert data["data"]["status"] == "PENDING"
        assert "id" in data["data"]
        assert "image_url" in data["data"]

    def test_create_scan_plant_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Creating a scan for a non-existent plant returns 404."""
        fake_id = str(uuid.uuid4())
        image = create_test_image()

        response = client.post(
            f"/api/plants/{fake_id}/scans",
            files={"image": image},
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_create_scan_unauthenticated(
        self, client: TestClient, created_plant: dict
    ):
        """Unauthenticated scan creation should be rejected."""
        plant_id = created_plant["id"]
        image = create_test_image()

        response = client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": image},
        )
        assert response.status_code == 403

    def test_create_scan_invalid_file_type(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """Uploading a non-image file should be rejected."""
        plant_id = created_plant["id"]
        fake_file = ("document.pdf", io.BytesIO(b"fake pdf content"), "application/pdf")

        response = client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": fake_file},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestListScans:
    """Tests for GET /api/plants/{plant_id}/scans"""

    def test_list_scans_empty(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """Empty scan list for a plant with no scans."""
        plant_id = created_plant["id"]
        response = client.get(
            f"/api/plants/{plant_id}/scans", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["data"] == []

    def test_list_scans_with_data(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User sees scans for their plant after creating one."""
        plant_id = created_plant["id"]

        # Create a scan
        image = create_test_image()
        client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": image},
            headers=auth_headers,
        )

        response = client.get(
            f"/api/plants/{plant_id}/scans", headers=auth_headers
        )
        assert response.status_code == 200
        assert len(response.json()["data"]) == 1


class TestGetScan:
    """Tests for GET /api/scans/{scan_id}"""

    def test_get_scan_success(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User can retrieve a scan by ID."""
        plant_id = created_plant["id"]
        image = create_test_image()

        # Create scan
        create_response = client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": image},
            headers=auth_headers,
        )
        scan_id = create_response.json()["data"]["id"]

        # Get scan
        response = client.get(f"/api/scans/{scan_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["data"]["id"] == scan_id

    def test_get_scan_not_found(self, client: TestClient, auth_headers: dict):
        """Getting a non-existent scan returns 404."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/api/scans/{fake_id}", headers=auth_headers)
        assert response.status_code == 404


class TestScanOwnership:
    """Tests that users can only access scans for their own plants."""

    def test_cannot_access_other_users_scan(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User A cannot access scans of User B's plant."""
        plant_id = created_plant["id"]

        # Create a scan as user A
        image = create_test_image()
        create_response = client.post(
            f"/api/plants/{plant_id}/scans",
            files={"image": image},
            headers=auth_headers,
        )
        scan_id = create_response.json()["data"]["id"]

        # Register user B
        other_user = client.post(
            "/api/auth/register",
            json={
                "name": "Other User",
                "email": f"other_{uuid.uuid4().hex[:8]}@example.com",
                "password": "password123",
            },
        )
        other_token = other_user.json()["data"]["access_token"]
        other_headers = {"Authorization": f"Bearer {other_token}"}

        # User B tries to get user A's scan
        response = client.get(f"/api/scans/{scan_id}", headers=other_headers)
        assert response.status_code == 404
