"""
Health analysis service — orchestrates the image → health analysis → result pipeline.

This is the high-level service used by the scan pipeline. It delegates to a
provider (currently GroqHealthProvider) and can be swapped for any
HealthAnalysisProvider implementation without touching routers.
"""

import logging
from typing import Optional

from app.ai.providers.groq_health_provider import GroqHealthProvider, GroqHealthError

logger = logging.getLogger(__name__)

# Confidence threshold below which results are flagged as unreliable
LOW_CONFIDENCE_THRESHOLD = 0.40


class HealthAnalysisService:
    """
    Orchestrates plant health analysis using an AI provider.

    Currently uses Groq vision LLM. To swap providers, replace
    self.provider with any HealthAnalysisProvider implementation:
        - ExternalDiseaseAPIProvider
        - CustomMLModelProvider
        - ComputerVisionProvider
    """

    def __init__(self):
        self.provider = GroqHealthProvider()

    async def analyze(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict:
        """
        Analyze plant health from an image.

        Args:
            image_path: Path to the plant image file on disk.
            plant_species: Optional known species for context-aware analysis.

        Returns:
            Structured health analysis result:
            {
                "healthStatus": "healthy" | "warning" | "diseased",
                "issue": "string",
                "confidence": 0.0-1.0,
                "severity": "low" | "medium" | "high",
                "symptoms": [...],
                "possibleCauses": [...],
                "lowConfidence": bool
            }

        Raises:
            GroqHealthError: On API or processing errors.
        """
        result = await self.provider.analyze_health(image_path, plant_species)

        confidence = result.get("confidence", 0.0)

        # Add lowConfidence flag for the frontend
        result["lowConfidence"] = confidence < LOW_CONFIDENCE_THRESHOLD

        return result
