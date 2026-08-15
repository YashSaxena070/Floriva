"""
Groq Vision LLM provider for plant health and disease analysis.

Implements HealthAnalysisProvider and DiseaseAnalysisProvider using Groq's
vision-capable LLM (llama-3.2-90b-vision-preview).

Designed to be swappable — any future provider (external disease API,
custom ML model, computer vision model) can replace this by implementing
the same abstract interfaces.
"""

import base64
import json
import logging
from pathlib import Path
from typing import Any, Optional

from groq import AsyncGroq

from app.ai.providers.base import HealthAnalysisProvider, DiseaseAnalysisProvider
from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Groq model with vision capabilities
GROQ_VISION_MODEL = "llama-3.2-90b-vision-preview"

# Timeout for Groq API calls (seconds)
GROQ_TIMEOUT = 60.0

# Confidence threshold below which we flag results as unreliable
LOW_CONFIDENCE_THRESHOLD = 0.40


class GroqHealthError(Exception):
    """Raised when Groq health analysis fails."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


# System prompt shared by health and disease analysis
_HEALTH_SYSTEM_PROMPT = """You are Plantify AI, a plant pathologist assistant.
You analyze plant images for health conditions.

CRITICAL RULES:
- Do NOT present uncertain predictions as confirmed diagnoses.
- Always include a confidence level (0.0 to 1.0) representing how certain you are.
- If you cannot clearly identify an issue, set confidence low and say so.
- Base your analysis ONLY on what is visible in the image.
- Analyze for: healthy condition, disease symptoms, pest damage, nutrient deficiency,
  leaf discoloration, wilting, fungal symptoms, and plant stress.

You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences."""

_HEALTH_USER_PROMPT = """Analyze this plant image for health and disease indicators.
{species_context}

Respond with EXACTLY this JSON schema:
{{
  "healthStatus": "healthy" | "warning" | "diseased",
  "issue": "string describing the detected issue, or 'No issues detected' if healthy",
  "confidence": 0.0 to 1.0,
  "severity": "low" | "medium" | "high",
  "symptoms": ["list", "of", "observed", "symptoms"],
  "possibleCauses": ["list", "of", "possible", "causes"]
}}

If you are NOT confident in your analysis (confidence below 0.4), set:
- healthStatus: "warning"
- issue: "Unable to determine the issue confidently. Please upload a clearer image."
- confidence: your actual confidence value
- severity: "low"
- symptoms: []
- possibleCauses: []"""

_DISEASE_USER_PROMPT = """Analyze this plant image specifically for diseases and infections.
{species_context}

Look for: fungal infections, bacterial diseases, viral symptoms, pest damage,
rot, blight, mildew, rust, leaf spot, canker, and any other pathological conditions.

Respond with EXACTLY this JSON schema:
{{
  "healthStatus": "healthy" | "warning" | "diseased",
  "issue": "string — name of the disease or 'No disease detected'",
  "confidence": 0.0 to 1.0,
  "severity": "low" | "medium" | "high",
  "symptoms": ["list", "of", "observed", "disease", "symptoms"],
  "possibleCauses": ["list", "of", "possible", "disease", "causes"]
}}

If you are NOT confident in your diagnosis (confidence below 0.4), set:
- healthStatus: "warning"
- issue: "Unable to determine the issue confidently. Please upload a clearer image."
- confidence: your actual confidence value
- severity: "low"
- symptoms: []
- possibleCauses: []"""


def _encode_image_to_base64(image_path: str) -> str:
    """Read an image file and return its base64 encoding."""
    path = Path(image_path)
    if not path.exists():
        raise GroqHealthError(f"Image file not found: {image_path}")

    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


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


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    """
    Parse JSON from LLM response, stripping markdown fences if present.

    Returns a validated dict matching the health result schema.
    """
    # Strip markdown code fences
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```)
        first_newline = cleaned.index("\n") if "\n" in cleaned else len(cleaned)
        cleaned = cleaned[first_newline + 1:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse Groq response as JSON: %s", e)
        logger.debug("Raw response: %s", raw_text)
        raise GroqHealthError(
            "AI returned an invalid response. Please try again.",
            status_code=502,
        )

    # Validate required fields
    required_fields = ["healthStatus", "issue", "confidence", "severity", "symptoms", "possibleCauses"]
    for field in required_fields:
        if field not in parsed:
            logger.warning("Missing field '%s' in Groq response", field)

    # Normalize values
    health_status = str(parsed.get("healthStatus", "warning")).lower()
    if health_status not in ("healthy", "warning", "diseased"):
        health_status = "warning"

    severity = str(parsed.get("severity", "low")).lower()
    if severity not in ("low", "medium", "high"):
        severity = "low"

    confidence = float(parsed.get("confidence", 0.0))
    confidence = max(0.0, min(1.0, confidence))

    # Apply low-confidence guard
    if confidence < LOW_CONFIDENCE_THRESHOLD:
        return {
            "healthStatus": "warning",
            "issue": "Unable to determine the issue confidently. Please upload a clearer image.",
            "confidence": confidence,
            "severity": "low",
            "symptoms": [],
            "possibleCauses": [],
        }

    return {
        "healthStatus": health_status,
        "issue": str(parsed.get("issue", "Unknown")),
        "confidence": round(confidence, 4),
        "severity": severity,
        "symptoms": list(parsed.get("symptoms", [])),
        "possibleCauses": list(parsed.get("possibleCauses", [])),
    }


class GroqHealthProvider(HealthAnalysisProvider, DiseaseAnalysisProvider):
    """
    Groq vision LLM provider for plant health and disease analysis.

    Uses Groq's vision-capable model to analyze plant images.
    Implements both HealthAnalysisProvider and DiseaseAnalysisProvider,
    making it a single provider that covers both use cases.

    To swap this out for a different AI provider:
    1. Create a new class implementing HealthAnalysisProvider and/or DiseaseAnalysisProvider
    2. Change the provider instantiation in HealthAnalysisService / DiseaseAnalysisService
    3. No router or controller changes needed
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        if not self.api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured. "
                "Set it in your .env file to use health analysis."
            )
        self.client = AsyncGroq(api_key=self.api_key, timeout=GROQ_TIMEOUT)

    async def analyze_health(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Analyze plant health from an image using Groq vision LLM.

        Args:
            image_path: Path to the plant image file on disk.
            plant_species: Optional known species for context-aware analysis.

        Returns:
            Dict matching the PlantHealthResult schema:
            {
                "healthStatus": "healthy" | "warning" | "diseased",
                "issue": "string",
                "confidence": 0.0-1.0,
                "severity": "low" | "medium" | "high",
                "symptoms": [...],
                "possibleCauses": [...]
            }
        """
        return await self._call_groq(
            image_path=image_path,
            plant_species=plant_species,
            user_prompt_template=_HEALTH_USER_PROMPT,
        )

    async def detect_diseases(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Detect diseases in a plant image using Groq vision LLM.

        Args:
            image_path: Path to the plant image file on disk.
            plant_species: Optional known species for better detection.

        Returns:
            Dict matching the PlantHealthResult schema (same structure as
            analyze_health, but with disease-focused analysis).
        """
        return await self._call_groq(
            image_path=image_path,
            plant_species=plant_species,
            user_prompt_template=_DISEASE_USER_PROMPT,
        )

    async def _call_groq(
        self,
        image_path: str,
        plant_species: Optional[str],
        user_prompt_template: str,
    ) -> dict[str, Any]:
        """
        Internal method: encode image, build messages, call Groq, parse response.
        """
        # Resolve the on-disk path
        resolved_path = Path(image_path)
        if not resolved_path.is_absolute():
            resolved_path = Path(image_path.lstrip("/"))

        # Encode image
        try:
            image_b64 = _encode_image_to_base64(str(resolved_path))
        except GroqHealthError:
            raise
        except Exception as e:
            raise GroqHealthError(f"Failed to read image: {e}")

        mime_type = _guess_mime(resolved_path)

        # Build species context
        species_context = ""
        if plant_species:
            species_context = f"The plant has been identified as: {plant_species}."

        user_prompt = user_prompt_template.format(species_context=species_context)

        # Build messages with image
        messages = [
            {
                "role": "system",
                "content": _HEALTH_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": user_prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{mime_type};base64,{image_b64}",
                        },
                    },
                ],
            },
        ]

        try:
            logger.info(
                "Calling Groq vision API for health analysis (species=%s)",
                plant_species or "unknown",
            )

            response = await self.client.chat.completions.create(
                model=GROQ_VISION_MODEL,
                messages=messages,
                temperature=0.2,
                max_tokens=1024,
            )

            raw_text = response.choices[0].message.content or ""
            logger.debug("Groq raw response: %s", raw_text[:500])

            return _parse_json_response(raw_text)

        except Exception as e:
            error_msg = str(e)
            logger.exception("Groq health analysis failed: %s", error_msg)

            # Check for specific error types
            if "rate_limit" in error_msg.lower():
                raise GroqHealthError(
                    "AI analysis rate limit reached. Please try again later.",
                    status_code=429,
                )
            if "timeout" in error_msg.lower():
                raise GroqHealthError(
                    "AI analysis timed out. Please try again.",
                    status_code=504,
                )

            raise GroqHealthError(
                f"Health analysis failed: {error_msg}",
                status_code=502,
            )
