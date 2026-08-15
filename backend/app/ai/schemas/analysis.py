"""
Pydantic schemas for AI analysis results.
These define the data structures that AI providers should return.
"""

from typing import Literal, Optional, Any
from pydantic import BaseModel, Field


class PlantHealthResult(BaseModel):
    """
    Structured health/disease analysis result (camelCase format for frontend compatibility).
    """
    healthStatus: Literal["healthy", "warning", "diseased"]
    issue: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: Literal["none", "low", "medium", "high"] = "low"
    symptoms: list[str] = []
    possibleCauses: list[str] = []
    lowConfidence: bool = False


class PlantHealthAnalysisOutput(BaseModel):
    """
    Structured health/disease analysis validation contract (snake_case for graph & database).
    Ensures arbitrary LLM text cannot bypass validation before database insertion.
    """
    health_status: Literal["healthy", "warning", "diseased"] = Field(
        default="healthy",
        description="Overall health state: healthy, warning (mild stress), or diseased",
    )
    issue: str = Field(
        default="No issues detected",
        max_length=500,
        description="Specific disease name, pest damage, deficiency, or 'No issues detected'",
    )
    confidence: float = Field(
        default=0.9,
        ge=0.0,
        le=1.0,
        description="Confidence level between 0.0 and 1.0",
    )
    severity: Literal["none", "low", "medium", "high"] = Field(
        default="none",
        description="Severity level of the problem",
    )
    symptoms: list[str] = Field(
        default_factory=list,
        description="List of observed symptoms (e.g. leaf spots, yellowing, wilting, powdery mildew)",
    )
    possible_causes: list[str] = Field(
        default_factory=list,
        description="List of underlying causes (e.g. fungal infection, nutrient deficiency, overwatering)",
    )


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
