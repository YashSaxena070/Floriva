"""
Plant identification service — orchestrates the image → identify → store pipeline.

This is the high-level service used by routers. It delegates to a provider
(currently PlantNetProvider) and can be extended for other providers or
disease analysis in the future.
"""

import logging
from typing import Optional

from app.ai.providers.plantnet_provider import PlantNetProvider, PlantNetError

logger = logging.getLogger(__name__)

# Confidence threshold below which we flag results as "low confidence"
LOW_CONFIDENCE_THRESHOLD = 0.30


class PlantIdentificationService:
    """
    Orchestrates plant identification using an AI provider.

    Currently uses Pl@ntNet. Designed to be swappable — replace
    self.provider with any PlantIdentificationProvider implementation.
    """

    def __init__(self):
        self.provider = PlantNetProvider()

    async def identify(
        self,
        image_path: str,
        organs: Optional[list[str]] = None,
    ) -> dict:
        """
        Identify a plant from one or more image paths.

        Args:
            image_path: Path(s) to image file(s) on disk (comma-separated for multiple).
            organs: Optional list of plant organ types in the image.

        Returns:
            Structured identification result dict:
                {
                    "plant": {
                        "name": "Snake Plant",
                        "scientificName": "Dracaena trifasciata",
                        "confidence": 0.94,
                        "family": "Asparagaceae",
                        "genus": "Dracaena",
                        "commonNames": ["Snake Plant", "Mother-in-law's Tongue"],
                    },
                    "alternatives": [
                        {
                            "name": "...",
                            "scientificName": "...",
                            "confidence": 0.03,
                            ...
                        }
                    ],
                    "lowConfidence": False,
                    "raw_response": { ... }
                }

        Raises:
            PlantNetError: On API or validation errors.
        """
        result = await self.provider.identify(image_path, organs)

        best = result["best_match"]
        confidence = best.get("confidence", 0.0)

        return {
            "plant": {
                "name": best.get("common_name") or best.get("scientific_name", "Unknown"),
                "scientificName": best.get("scientific_name", ""),
                "confidence": confidence,
                "family": best.get("family", ""),
                "genus": best.get("genus", ""),
                "commonNames": best.get("common_names", []),
            },
            "alternatives": [
                {
                    "name": alt.get("common_name") or alt.get("scientific_name", "Unknown"),
                    "scientificName": alt.get("scientific_name", ""),
                    "confidence": alt.get("confidence", 0.0),
                    "family": alt.get("family", ""),
                    "genus": alt.get("genus", ""),
                }
                for alt in result.get("alternatives", [])
            ],
            "lowConfidence": confidence < LOW_CONFIDENCE_THRESHOLD,
            "raw_response": result.get("raw_response"),
        }
