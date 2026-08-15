"""
API response schemas for AI care & treatment recommendations.
"""

import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class CareDataResponse(BaseModel):
    """Care plan data in API responses."""
    watering: str = ""
    sunlight: str = ""
    temperature: str = ""
    humidity: str = ""
    soil: str = ""
    fertilization: str = ""
    pruning: str = ""


class ProblemDataResponse(BaseModel):
    """Problem diagnosis data in API responses."""
    detected: bool = False
    name: str = ""
    category: str = "healthy"
    severity: str = "none"
    description: str = ""


class TreatmentDataResponse(BaseModel):
    """Treatment plan data in API responses."""
    required: bool = False
    product_category: str = ""
    recommended_actions: list[str] = []
    frequency: str = ""
    estimated_duration: str = ""
    precautions: list[str] = []
    instructions: str = ""


class RecommendationResponse(BaseModel):
    """
    Full AI analysis recommendation response.

    Returned by:
        POST /api/scans/{scan_id}/analyze
        GET  /api/scans/{scan_id}/recommendation
    """
    id: uuid.UUID
    scan_id: uuid.UUID
    summary: str
    care: CareDataResponse
    problem: ProblemDataResponse
    treatment: TreatmentDataResponse
    provider: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_db_model(cls, model) -> "RecommendationResponse":
        """
        Build response from CareRecommendation ORM model.

        The DB model stores care/problem/treatment as JSONB dicts;
        this method unpacks them into nested Pydantic models.
        """
        care_data = model.care_data or {}
        treatment_data = model.treatment_data or {}

        # Build problem from top-level DB fields + any extra in care_data
        problem = ProblemDataResponse(
            detected=model.problem_detected,
            name=care_data.get("problem", {}).get("name", ""),
            category=model.problem_category or "healthy",
            severity=model.problem_severity or "none",
            description=care_data.get("problem", {}).get("description", ""),
        )

        return cls(
            id=model.id,
            scan_id=model.scan_id,
            summary=model.summary or "",
            care=CareDataResponse(**care_data.get("care", care_data))
            if "watering" in care_data.get("care", care_data)
            else CareDataResponse(**care_data)
            if "watering" in care_data
            else CareDataResponse(),
            problem=problem,
            treatment=TreatmentDataResponse(**treatment_data)
            if treatment_data
            else TreatmentDataResponse(),
            provider=model.provider,
            created_at=model.created_at,
        )
