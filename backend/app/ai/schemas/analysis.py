"""
Pydantic schemas for AI analysis results.
These define the data structures that AI providers should return.
"""

from typing import Optional, Any
from pydantic import BaseModel, Field


class IdentificationResult(BaseModel):
    """Result from a plant identification provider."""
    species: str
    common_names: list[str] = []
    confidence: float = Field(..., ge=0.0, le=1.0)
    family: Optional[str] = None
    genus: Optional[str] = None
    description: Optional[str] = None
    images: list[str] = []
    raw_response: Optional[dict[str, Any]] = None


class HealthIssue(BaseModel):
    """A single health issue detected in a plant."""
    name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: str = "low"  # low, medium, high, critical
    description: Optional[str] = None
    symptoms: list[str] = []
    possible_causes: list[str] = []
    treatment: Optional[str] = None


class HealthAnalysisResult(BaseModel):
    """Result from a health analysis provider."""
    health_status: str  # Healthy, Good, Needs Attention, Critical
    health_score: float = Field(..., ge=0.0, le=100.0)
    issues: list[HealthIssue] = []
    recommendations: list[str] = []
    raw_response: Optional[dict[str, Any]] = None


class DiseaseResult(BaseModel):
    """Result from a disease detection provider."""
    disease_name: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: str = "low"  # low, medium, high, critical
    description: Optional[str] = None
    symptoms: list[str] = []
    causes: list[str] = []
    treatment_suggestions: list[str] = []
    prevention_tips: list[str] = []
    raw_response: Optional[dict[str, Any]] = None


class CareRecommendation(BaseModel):
    """Result from a care recommendation provider."""
    watering: Optional[dict[str, Any]] = None
    sunlight: Optional[dict[str, Any]] = None
    fertilizer: Optional[dict[str, Any]] = None
    general_tips: list[str] = []
    seasonal_advice: Optional[str] = None
