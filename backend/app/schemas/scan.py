"""
Scan schemas for plant scanning and health analysis.
"""

import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


class ScanResponse(BaseModel):
    """Schema for scan data in API responses."""
    id: uuid.UUID
    plant_id: uuid.UUID
    image_url: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class HealthAnalysisResponse(BaseModel):
    """Schema for health analysis data in API responses."""
    id: uuid.UUID
    scan_id: uuid.UUID
    health_status: Optional[str]
    issue: Optional[str]
    confidence: Optional[float]
    severity: Optional[str]
    symptoms: Optional[Any]
    possible_causes: Optional[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanDetailResponse(BaseModel):
    """Schema for detailed scan data including health analyses."""
    id: uuid.UUID
    plant_id: uuid.UUID
    image_url: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime]
    health_analyses: list[HealthAnalysisResponse] = []

    model_config = {"from_attributes": True}


# ── Identification Schemas ────────────────────────────────────────


class IdentificationPlantResult(BaseModel):
    """A single identified plant species."""
    name: str
    scientificName: str
    confidence: float
    family: str = ""
    genus: str = ""
    commonNames: list[str] = []


class IdentificationAlternative(BaseModel):
    """An alternative identification candidate."""
    name: str
    scientificName: str
    confidence: float
    family: str = ""
    genus: str = ""


class IdentificationData(BaseModel):
    """
    Full identification response data.
    Matches the user-requested JSON shape:
    {
        "scan_id": "...",
        "plant": { "name": ..., "scientificName": ..., "confidence": ... },
        "alternatives": [...]
    }
    """
    scan_id: uuid.UUID
    plant: IdentificationPlantResult
    alternatives: list[IdentificationAlternative] = []
    lowConfidence: bool = False

