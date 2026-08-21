"""
Tests for plant CRUD endpoints and ownership validation.
"""

import uuid
import pytest
from fastapi.testclient import TestClient


class TestCreatePlant:
    """Tests for POST /api/plants"""

    def test_create_plant_success(
        self, client: TestClient, auth_headers: dict, test_plant_data: dict
    ):
        """Authenticated user can create a plant."""
        response = client.post(
            "/api/plants", json=test_plant_data, headers=auth_headers
        )
        assert response.status_code == 201

        data = response.json()
        assert data["success"] is True
        assert data["data"]["name"] == test_plant_data["name"]
        assert data["data"]["scientific_name"] == test_plant_data["scientific_name"]
        assert "id" in data["data"]
        assert "user_id" in data["data"]

    def test_create_plant_minimal_data(
        self, client: TestClient, auth_headers: dict
    ):
        """Plant can be created with just a name."""
        response = client.post(
            "/api/plants",
            json={"name": "Mystery Plant"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        assert response.json()["data"]["name"] == "Mystery Plant"

    def test_create_plant_unauthenticated(
        self, client: TestClient, test_plant_data: dict
    ):
        """Unauthenticated request should be rejected."""
        response = client.post("/api/plants", json=test_plant_data)
        assert response.status_code == 403


class TestListPlants:
    """Tests for GET /api/plants"""

    def test_list_plants_empty(self, client: TestClient, auth_headers: dict):
        """Empty plant list for new user."""
        response = client.get("/api/plants", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["data"] == []

    def test_list_plants_with_data(
        self, client: TestClient, auth_headers: dict, test_plant_data: dict
    ):
        """User sees their own plants."""
        # Create two plants
        client.post("/api/plants", json=test_plant_data, headers=auth_headers)
        client.post(
            "/api/plants",
            json={"name": "Aloe Vera"},
            headers=auth_headers,
        )

        response = client.get("/api/plants", headers=auth_headers)
        assert response.status_code == 200
        assert len(response.json()["data"]) == 2


class TestGetPlant:
    """Tests for GET /api/plants/{plant_id}"""

    def test_get_plant_success(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User can get their own plant by ID."""
        plant_id = created_plant["id"]
        response = client.get(f"/api/plants/{plant_id}", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["data"]["id"] == plant_id

    def test_get_plant_not_found(self, client: TestClient, auth_headers: dict):
        """Getting a non-existent plant returns 404."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/api/plants/{fake_id}", headers=auth_headers)
        assert response.status_code == 404


class TestUpdatePlant:
    """Tests for PATCH /api/plants/{plant_id}"""

    def test_update_plant_success(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User can update their own plant."""
        plant_id = created_plant["id"]
        response = client.patch(
            f"/api/plants/{plant_id}",
            json={"name": "Updated Plant Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["data"]["name"] == "Updated Plant Name"

    def test_update_plant_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Updating a non-existent plant returns 404."""
        fake_id = str(uuid.uuid4())
        response = client.patch(
            f"/api/plants/{fake_id}",
            json={"name": "Nope"},
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestDeletePlant:
    """Tests for DELETE /api/plants/{plant_id}"""

    def test_delete_plant_success(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User can delete their own plant."""
        plant_id = created_plant["id"]
        response = client.delete(f"/api/plants/{plant_id}", headers=auth_headers)
        assert response.status_code == 200

        # Verify it's gone
        response = client.get(f"/api/plants/{plant_id}", headers=auth_headers)
        assert response.status_code == 404


class TestPlantOwnership:
    """Tests that users can only access their own plants."""

    def test_cannot_access_other_users_plant(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User A cannot access User B's plant."""
        plant_id = created_plant["id"]

        # Register a second user
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

        # Try to access user A's plant
        response = client.get(f"/api/plants/{plant_id}", headers=other_headers)
        assert response.status_code == 404

    def test_cannot_delete_other_users_plant(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User A cannot delete User B's plant."""
        plant_id = created_plant["id"]

        # Register a second user
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

        # Try to delete user A's plant
        response = client.delete(f"/api/plants/{plant_id}", headers=other_headers)
        assert response.status_code == 404

        # Verify the plant still exists for user A
        response = client.get(f"/api/plants/{plant_id}", headers=auth_headers)
        assert response.status_code == 200


class TestPlantHealthTimeline:
    """Tests for plant health timeline recording and retrieval."""

    def test_plant_created_with_initial_timeline_record(
        self, client: TestClient, auth_headers: dict, test_plant_data: dict
    ):
        """When a plant is created, its baseline health scan is stored in the database."""
        response = client.post(
            "/api/plants", json=test_plant_data, headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()["data"]
        assert "health_timeline" in data
        assert len(data["health_timeline"]) >= 1
        assert data["health_timeline"][0]["score"] in (95, 96)

    def test_record_health_scan_and_fetch_timeline(
        self, client: TestClient, auth_headers: dict, created_plant: dict
    ):
        """User can record new health scans and retrieve the chronological timeline."""
        plant_id = created_plant["id"]

        # Record a new scan with a lower health score
        rescan = client.post(
            f"/api/plants/{plant_id}/health-scans",
            json={
                "score": 82,
                "health_status": "Good",
                "issue": "Slight underwatering detected",
            },
            headers=auth_headers,
        )
        assert rescan.status_code == 201
        rescan_data = rescan.json()["data"]
        assert rescan_data["score"] == 82
        assert rescan_data["health_status"] == "Good"

        # Fetch timeline endpoint
        timeline_res = client.get(
            f"/api/plants/{plant_id}/health-timeline",
            headers=auth_headers,
        )
        assert timeline_res.status_code == 200
        timeline = timeline_res.json()["data"]
        assert len(timeline) >= 2
        scores = [pt["score"] for pt in timeline]
        assert 82 in scores
