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

    def delete_plant(self, plant_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """
        Delete a plant, ensuring ownership.
        Raises ValueError if not found or not owned by user.
        """
        plant = self.get_plant(plant_id, user_id)
        self.plant_repo.delete(plant)
