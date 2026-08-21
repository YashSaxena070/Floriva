"""
Plant service: CRUD operations with ownership validation.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.plant import Plant
from app.repositories.plant_repository import PlantRepository


class PlantService:
    """Business logic for plant management."""

    def __init__(self, db: Session):
        self.db = db
        self.plant_repo = PlantRepository(db)

    def create_plant(
        self,
        user_id: uuid.UUID,
        name: str,
        scientific_name: Optional[str] = None,
        identification_confidence: Optional[float] = None,
        image_url: Optional[str] = None,
    ) -> Plant:
        """Create a new plant for the authenticated user."""
        return self.plant_repo.create(
            user_id=user_id,
            name=name,
            scientific_name=scientific_name,
            identification_confidence=identification_confidence,
            image_url=image_url,
        )

    def get_plant(self, plant_id: uuid.UUID, user_id: uuid.UUID) -> Plant:
        """
        Get a plant by ID, ensuring ownership.
        Raises ValueError if not found or not owned by user.
        """
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")
        return plant

    def get_user_plants(self, user_id: uuid.UUID) -> list[Plant]:
        """Get all plants belonging to the authenticated user."""
        return self.plant_repo.get_all_by_user(user_id)

    def update_plant(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        update_data: dict,
    ) -> Plant:
        """
        Update a plant, ensuring ownership.
        Raises ValueError if not found or not owned by user.
        """
        plant = self.get_plant(plant_id, user_id)
        return self.plant_repo.update(plant, update_data)

    def format_plant_response(self, plant: Plant) -> dict:
        """Format a plant model into PlantResponse dictionary with health_timeline."""
        timeline = self.plant_repo.build_health_timeline(plant)
        images = [
            {
                "id": img.id,
                "image_url": img.image_url,
                "image_type": img.image_type,
                "created_at": img.created_at,
            }
            for img in (plant.images or [])
        ]
        return {
            "id": plant.id,
            "user_id": plant.user_id,
            "name": plant.name,
            "scientific_name": plant.scientific_name,
            "identification_confidence": plant.identification_confidence,
            "image_url": plant.image_url,
            "created_at": plant.created_at,
            "updated_at": plant.updated_at,
            "images": images,
            "health_timeline": timeline,
        }

    def add_health_scan(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        score: int,
        health_status: Optional[str] = None,
        issue: Optional[str] = None,
        image_url: Optional[str] = None,
        date_ms: Optional[int] = None,
    ) -> dict:
        """Record a health scan for a plant and return the created timeline point."""
        plant = self.get_plant(plant_id, user_id)
        ha = self.plant_repo.add_health_scan(
            plant=plant,
            score=score,
            health_status=health_status,
            issue=issue,
            image_url=image_url,
            date_ms=date_ms,
        )
        return {
            "id": ha.id,
            "scan_id": ha.scan_id,
            "date": int(ha.created_at.timestamp() * 1000),
            "score": score,
            "health_status": ha.health_status,
            "issue": ha.issue,
            "image_url": image_url or plant.image_url,
            "created_at": ha.created_at,
        }

    def get_health_timeline(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[dict]:
        """Fetch chronological health timeline for a plant."""
        plant = self.get_plant(plant_id, user_id)
        return self.plant_repo.build_health_timeline(plant)

    def delete_plant(self, plant_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """
        Delete a plant, ensuring ownership.
        Raises ValueError if not found or not owned by user.
        """
        plant = self.get_plant(plant_id, user_id)
        self.plant_repo.delete(plant)
