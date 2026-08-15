"""
Data access layer for PlantScan, HealthAnalysis, IdentificationResult,
and CareRecommendation models.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.plant_scan import PlantScan, ScanStatus
from app.models.health_analysis import HealthAnalysis
from app.models.identification_result import IdentificationResult
from app.models.care_recommendation import CareRecommendation


class ScanRepository:
    """Repository for PlantScan, HealthAnalysis, IdentificationResult,
    and CareRecommendation CRUD operations."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, scan_id: uuid.UUID) -> Optional[PlantScan]:
        """Fetch a scan by ID, including health analyses, identification result,
        and care recommendation."""
        return (
            self.db.query(PlantScan)
            .options(
                joinedload(PlantScan.health_analyses),
                joinedload(PlantScan.identification_result),
                joinedload(PlantScan.care_recommendation),
            )
            .filter(PlantScan.id == scan_id)
            .first()
        )

    def get_scans_for_plant(self, plant_id: uuid.UUID) -> list[PlantScan]:
        """Fetch all scans for a specific plant, ordered by creation date."""
        return (
            self.db.query(PlantScan)
            .options(
                joinedload(PlantScan.health_analyses),
                joinedload(PlantScan.identification_result),
                joinedload(PlantScan.care_recommendation),
            )
            .filter(PlantScan.plant_id == plant_id)
            .order_by(PlantScan.created_at.desc())
            .all()
        )

    def create(
        self,
        plant_id: uuid.UUID,
        image_url: str,
        status: ScanStatus = ScanStatus.PENDING,
    ) -> PlantScan:
        """Create a new scan record."""
        scan = PlantScan(
            plant_id=plant_id,
            image_url=image_url,
            status=status,
        )
        self.db.add(scan)
        self.db.commit()
        self.db.refresh(scan)
        return scan

    def update_status(
        self,
        scan: PlantScan,
        status: ScanStatus,
        completed_at=None,
    ) -> PlantScan:
        """Update the status of a scan."""
        scan.status = status
        if completed_at:
            scan.completed_at = completed_at
        self.db.commit()
        self.db.refresh(scan)
        return scan

    def add_health_analysis(
        self,
        scan_id: uuid.UUID,
        health_status: Optional[str] = None,
        issue: Optional[str] = None,
        confidence: Optional[float] = None,
        severity: Optional[str] = None,
        symptoms: Optional[dict] = None,
        possible_causes: Optional[dict] = None,
    ) -> HealthAnalysis:
        """Add a health analysis result to a scan."""
        analysis = HealthAnalysis(
            scan_id=scan_id,
            health_status=health_status,
            issue=issue,
            confidence=confidence,
            severity=severity,
            symptoms=symptoms,
            possible_causes=possible_causes,
        )
        self.db.add(analysis)
        self.db.commit()
        self.db.refresh(analysis)
        return analysis

    def add_identification_result(
        self,
        scan_id: uuid.UUID,
        common_name: Optional[str] = None,
        scientific_name: Optional[str] = None,
        family: Optional[str] = None,
        genus: Optional[str] = None,
        confidence: Optional[float] = None,
        common_names: Optional[list] = None,
        alternatives: Optional[list] = None,
        raw_response: Optional[dict] = None,
        provider: str = "plantnet",
    ) -> IdentificationResult:
        """Create an identification result record linked to a scan."""
        result = IdentificationResult(
            scan_id=scan_id,
            common_name=common_name,
            scientific_name=scientific_name,
            family=family,
            genus=genus,
            confidence=confidence,
            common_names=common_names,
            alternatives=alternatives,
            raw_response=raw_response,
            provider=provider,
        )
        self.db.add(result)
        self.db.commit()
        self.db.refresh(result)
        return result

    # ── CareRecommendation CRUD ──────────────────────────────────

    def add_care_recommendation(
        self,
        scan_id: uuid.UUID,
        summary: Optional[str] = None,
        care_data: Optional[dict] = None,
        problem_detected: bool = False,
        problem_category: Optional[str] = None,
        problem_severity: Optional[str] = None,
        treatment_data: Optional[dict] = None,
        raw_llm_response: Optional[dict] = None,
        provider: str = "groq",
    ) -> CareRecommendation:
        """
        Add a care recommendation to a scan.

        If a recommendation already exists for this scan (re-analysis),
        it is deleted first and replaced with the new one.
        """
        # Delete existing recommendation if present (overwrite on re-analysis)
        existing = self.get_care_recommendation(scan_id)
        if existing:
            self.db.delete(existing)
            self.db.flush()

        recommendation = CareRecommendation(
            scan_id=scan_id,
            summary=summary,
            care_data=care_data,
            problem_detected=problem_detected,
            problem_category=problem_category,
            problem_severity=problem_severity,
            treatment_data=treatment_data,
            raw_llm_response=raw_llm_response,
            provider=provider,
        )
        self.db.add(recommendation)
        self.db.commit()
        self.db.refresh(recommendation)
        return recommendation

    def get_care_recommendation(
        self, scan_id: uuid.UUID
    ) -> Optional[CareRecommendation]:
        """Fetch the care recommendation for a scan, if it exists."""
        return (
            self.db.query(CareRecommendation)
            .filter(CareRecommendation.scan_id == scan_id)
            .first()
        )


