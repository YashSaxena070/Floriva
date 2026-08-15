"""
Pl@ntNet API provider — concrete implementation of PlantIdentificationProvider.

Sends plant images to the Pl@ntNet v2 API and parses identification results.
API key is read from backend environment variables and never exposed to clients.
"""

import logging
from pathlib import Path
from typing import Any, Optional

import httpx

from app.ai.providers.base import PlantIdentificationProvider
from app.config.settings import get_settings

logger = logging.getLogger(__name__)

PLANTNET_API_URL = "https://my-api.plantnet.org/v2/identify/all"

# Timeout for Pl@ntNet API calls (seconds)
PLANTNET_TIMEOUT = 30.0


class PlantNetError(Exception):
    """Raised when the Pl@ntNet API returns an error."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class PlantNetProvider(PlantIdentificationProvider):
    """
    Pl@ntNet plant identification provider.

    Calls the Pl@ntNet v2 REST API with one or more plant images
    and returns structured identification results.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.PLANTNET_API_KEY
        if not self.api_key:
            raise ValueError(
                "PLANTNET_API_KEY is not configured. "
                "Set it in your .env file to use plant identification."
            )

    async def identify(
        self,
        image_path: str,
        organs: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Identify a plant from one or more image file paths.

        Args:
            image_path: Absolute path to the plant image file (or comma-separated
                        paths for multiple images).
            organs: Optional list of plant organs visible in the image
                    (e.g., ["leaf", "flower"]). Defaults to ["auto"].

        Returns:
            Dict with parsed identification results:
                - best_match: dict with common_name, scientific_name, confidence, etc.
                - alternatives: list[dict] of other possible matches
                - raw_response: full Pl@ntNet JSON response

        Raises:
            PlantNetError: If the API call fails or returns no results.
        """
        image_paths = [p.strip() for p in image_path.split(",") if p.strip()]
        organs_list = organs or ["auto"]

        url = f"{PLANTNET_API_URL}?api-key={self.api_key}"

        async with httpx.AsyncClient(timeout=PLANTNET_TIMEOUT) as client:
            # Build multipart form data
            files = []
            for img_path in image_paths:
                path = Path(img_path.lstrip("/"))
                if not path.exists():
                    raise PlantNetError(f"Image file not found: {img_path}")

                mime_type = self._guess_mime(path)
                files.append(
                    ("images", (path.name, open(path, "rb"), mime_type))
                )

            data = {}
            for i, organ in enumerate(organs_list):
                data[f"organs"] = organ  # Pl@ntNet expects flat "organs" field

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Origin": "http://localhost:8081",
                "Referer": "http://localhost:8081/",
            }

            try:
                logger.info(
                    "Calling Pl@ntNet API with %d image(s), organs=%s",
                    len(files),
                    organs_list,
                )
                response = await client.post(url, files=files, data=data, headers=headers)
            except httpx.TimeoutException:
                raise PlantNetError(
                    "Pl@ntNet API timed out. Please try again.", status_code=504
                )
            except httpx.RequestError as e:
                raise PlantNetError(
                    f"Network error calling Pl@ntNet: {e}", status_code=502
                )
            finally:
                # Close file handles
                for _, (_, fh, _) in files:
                    fh.close()

            # Parse response
            if response.status_code == 404:
                raise PlantNetError(
                    "No plant species could be identified in this image. "
                    "Try a clearer photo with leaves or flowers visible.",
                    status_code=404,
                )

            if response.status_code == 429:
                raise PlantNetError(
                    "Pl@ntNet API rate limit reached. Please try again later.",
                    status_code=429,
                )

            if response.status_code >= 400:
                error_body = response.text
                logger.error(
                    "Pl@ntNet API error %d: %s",
                    response.status_code,
                    error_body,
                )
                raise PlantNetError(
                    f"Pl@ntNet API error: {error_body}",
                    status_code=response.status_code,
                )

            raw = response.json()
            return self._parse_response(raw)

    async def get_plant_details(self, species: str) -> dict[str, Any]:
        """
        Get detailed info about a species.
        Not implemented for Pl@ntNet (identification-only provider).
        """
        raise NotImplementedError(
            "PlantNetProvider does not support get_plant_details. "
            "Use a different provider for plant care information."
        )

    def _parse_response(self, raw: dict) -> dict[str, Any]:
        """
        Parse the raw Pl@ntNet JSON response into a structured result.

        Returns:
            Dict with keys: best_match, alternatives, raw_response
        """
        results = raw.get("results", [])

        if not results:
            raise PlantNetError(
                "No identification results returned. "
                "The image may not contain a recognizable plant.",
                status_code=404,
            )

        best = results[0]
        best_match = self._extract_match(best)

        alternatives = []
        for alt in results[1:5]:  # Top 4 alternatives
            alternatives.append(self._extract_match(alt))

        return {
            "best_match": best_match,
            "alternatives": alternatives,
            "raw_response": raw,
        }

    @staticmethod
    def _extract_match(result: dict) -> dict[str, Any]:
        """Extract a structured match dict from a single Pl@ntNet result entry."""
        species = result.get("species", {})

        common_names = species.get("commonNames", [])
        common_name = common_names[0] if common_names else None

        return {
            "common_name": common_name,
            "common_names": common_names,
            "scientific_name": species.get("scientificNameWithoutAuthor", ""),
            "scientific_name_authorship": species.get("scientificNameAuthorship", ""),
            "family": (species.get("family") or {}).get(
                "scientificNameWithoutAuthor", ""
            ),
            "genus": (species.get("genus") or {}).get(
                "scientificNameWithoutAuthor", ""
            ),
            "confidence": round(result.get("score", 0.0), 4),
            "gbif_id": result.get("gbif", {}).get("id"),
        }

    @staticmethod
    def _guess_mime(path: Path) -> str:
        """Guess MIME type from file extension."""
        mime_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".heic": "image/heic",
            ".heif": "image/heif",
        }
        return mime_map.get(path.suffix.lower(), "image/jpeg")
