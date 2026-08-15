"""
Data access layer for Plant and PlantImage models.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.plant import Plant
from app.models.plant_image import PlantImage


class PlantRepository:
    """Repository for Plant CRUD operations, always scoped by user_id."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, plant_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Plant]:
        """Fetch a single plant by ID, scoped to the given user."""
        return (
            self.db.query(Plant)
            .options(joinedload(Plant.images))
            .filter(Plant.id == plant_id, Plant.user_id == user_id)
            .first()
        )

    def get_all_by_user(self, user_id: uuid.UUID) -> list[Plant]:
        """Fetch all plants belonging to a specific user."""
        return (
            self.db.query(Plant)
            .options(joinedload(Plant.images))
            .filter(Plant.user_id == user_id)
            .order_by(Plant.created_at.desc())
            .all()
        )

    def create(
        self,
        user_id: uuid.UUID,
        name: str,
        scientific_name: Optional[str] = None,
        identification_confidence: Optional[float] = None,
        image_url: Optional[str] = None,
        plant_id: Optional[uuid.UUID] = None,
    ) -> Plant:
        """Create a new plant record for the given user."""
        kwargs = {
            "user_id": user_id,
            "name": name,
            "scientific_name": scientific_name,
            "identification_confidence": identification_confidence,
            "image_url": image_url,
        }
        if plant_id:
            kwargs["id"] = plant_id

        plant = Plant(**kwargs)
        self.db.add(plant)
        self.db.commit()
        self.db.refresh(plant)
        return plant

    def update(self, plant: Plant, update_data: dict) -> Plant:
        """Update an existing plant with the given data dict."""
        for key, value in update_data.items():
            if value is not None:
                setattr(plant, key, value)
        self.db.commit()
        self.db.refresh(plant)
        return plant

    def delete(self, plant: Plant) -> None:
        """Delete a plant record (cascades to images and scans)."""
        self.db.delete(plant)
        self.db.commit()

    def add_image(
        self,
        plant_id: uuid.UUID,
        image_url: str,
        image_type: str = "scan",
    ) -> PlantImage:
        """Add an image record to a plant."""
        image = PlantImage(
            plant_id=plant_id,
            image_url=image_url,
            image_type=image_type,
        )
        self.db.add(image)
        self.db.commit()
        self.db.refresh(image)
        return image
