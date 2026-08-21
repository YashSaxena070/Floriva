"""
Data access layer for Plant and PlantImage models.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.plant import Plant
from app.models.plant_image import PlantImage
from app.models.plant_scan import PlantScan, ScanStatus
from app.models.health_analysis import HealthAnalysis
from datetime import datetime, timezone


def _normalize_confidence(val: Optional[float]) -> float:
    if val is None:
        return 0.95
    if val > 1.0:
        return val / 100.0
    return val


class PlantRepository:
    """Repository for Plant CRUD operations, always scoped by user_id."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, plant_id: uuid.UUID, user_id: uuid.UUID) -> Optional[Plant]:
        """Fetch a single plant by ID with images, scans, and health analyses."""
        return (
            self.db.query(Plant)
            .options(
                joinedload(Plant.images),
                selectinload(Plant.scans).selectinload(PlantScan.health_analyses),
            )
            .filter(Plant.id == plant_id, Plant.user_id == user_id)
            .first()
        )

    def get_all_by_user(self, user_id: uuid.UUID) -> list[Plant]:
        """Fetch all plants belonging to a specific user with health timeline."""
        return (
            self.db.query(Plant)
            .options(
                joinedload(Plant.images),
                selectinload(Plant.scans).selectinload(PlantScan.health_analyses),
            )
            .filter(Plant.user_id == user_id)
            .order_by(Plant.created_at.desc())
            .all()
        )

    def build_health_timeline(self, plant: Plant) -> list[dict]:
        """Extract and format the chronological health timeline for a plant."""
        timeline = []

        # 1. Baseline timeline point from plant creation
        if plant.identification_confidence is not None:
            conf = _normalize_confidence(plant.identification_confidence)
            score = int(round(conf * 100))
            timeline.append({
                "id": plant.id,
                "scan_id": None,
                "date": int(plant.created_at.timestamp() * 1000),
                "score": score,
                "health_status": "Excellent" if score >= 90 else "Good" if score >= 80 else "Fair",
                "issue": "Initial baseline health assessment",
                "image_url": plant.image_url,
                "created_at": plant.created_at,
            })

        # 2. Subsequent health scan records from scans & analyses
        for scan in plant.scans or []:
            for ha in scan.health_analyses or []:
                conf = ha.confidence if ha.confidence is not None else 0.9
                if conf > 1.0:
                    conf = conf / 100.0
                score = int(round(conf * 100))
                timeline.append({
                    "id": ha.id,
                    "scan_id": scan.id,
                    "date": int(ha.created_at.timestamp() * 1000),
                    "score": score,
                    "health_status": ha.health_status or ("Excellent" if score >= 90 else "Good" if score >= 80 else "Fair" if score >= 70 else "Needs Care"),
                    "issue": ha.issue,
                    "image_url": scan.image_url or plant.image_url,
                    "created_at": ha.created_at,
                })

        timeline.sort(key=lambda item: item["date"])
        return timeline

    def add_health_scan(
        self,
        plant: Plant,
        score: int,
        health_status: Optional[str] = None,
        issue: Optional[str] = None,
        image_url: Optional[str] = None,
        date_ms: Optional[int] = None,
    ) -> HealthAnalysis:
        """Add a health scan record to the database for a plant."""
        created_dt = (
            datetime.fromtimestamp(date_ms / 1000.0, tz=timezone.utc)
            if date_ms
            else datetime.now(timezone.utc)
        )
        img = image_url or plant.image_url or ""

        scan = PlantScan(
            plant_id=plant.id,
            image_url=img,
            status=ScanStatus.COMPLETED,
            created_at=created_dt,
            completed_at=created_dt,
        )
        self.db.add(scan)
        self.db.flush()

        status_str = health_status or (
            "Excellent" if score >= 90 else "Good" if score >= 80 else "Fair" if score >= 70 else "Needs Care"
        )
        ha = HealthAnalysis(
            scan_id=scan.id,
            health_status=status_str,
            issue=issue or "Healthy plant status",
            confidence=score / 100.0,
            severity="low" if score >= 80 else "medium" if score >= 70 else "high",
            created_at=created_dt,
        )
        self.db.add(ha)
        self.db.commit()
        self.db.refresh(ha)
        return ha

    def create(
        self,
        user_id: uuid.UUID,
        name: str,
        scientific_name: Optional[str] = None,
        identification_confidence: Optional[float] = None,
        image_url: Optional[str] = None,
        plant_id: Optional[uuid.UUID] = None,
    ) -> Plant:
        """Create a new plant record."""
        norm_conf = _normalize_confidence(identification_confidence) if identification_confidence is not None else None
        kwargs = {
            "user_id": user_id,
            "name": name,
            "scientific_name": scientific_name,
            "identification_confidence": norm_conf,
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
