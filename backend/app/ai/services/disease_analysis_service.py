"""
Disease analysis service — dedicated service for disease-specific detection.

Kept separate from HealthAnalysisService so that in the future a specialized
disease ML model can be plugged in while general health analysis stays on a
different provider (e.g., LLM).
"""

import logging
from typing import Optional

from app.ai.providers.groq_health_provider import GroqHealthProvider, GroqHealthError

logger = logging.getLogger(__name__)

# Confidence threshold below which results are flagged as unreliable
LOW_CONFIDENCE_THRESHOLD = 0.40


class DiseaseAnalysisService:
    """
    Orchestrates plant disease detection using an AI provider.

    Currently uses Groq vision LLM. To swap providers, replace
    self.provider with any DiseaseAnalysisProvider implementation:
        - CustomDiseaseMLProvider
        - ExternalDiseaseAPIProvider
        - ComputerVisionDiseaseProvider
    """

    def __init__(self):
        self.provider = GroqHealthProvider()

    async def detect(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict:
        """
        Detect diseases in a plant image.

        Args:
            image_path: Path to the plant image file on disk.
            plant_species: Optional known species for context-aware detection.

        Returns:
            Structured disease detection result:
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
        result = await self.provider.detect_diseases(image_path, plant_species)

        confidence = result.get("confidence", 0.0)

        # Add lowConfidence flag for the frontend
        result["lowConfidence"] = confidence < LOW_CONFIDENCE_THRESHOLD

        return result
