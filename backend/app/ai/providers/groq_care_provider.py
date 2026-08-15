"""
Groq LLM provider for plant care and treatment recommendations.

Uses Groq's text LLM (openai/gpt-oss-120b) to generate personalized
care plans and treatment instructions based on plant identification,
health analysis, and curated knowledge context.

This provider does NOT receive images — it works with the structured
data from prior identification and health analysis stages.

Implements the AIRecommendationProvider interface from base.py.
"""

import json
import logging
from typing import Any, Optional

from groq import AsyncGroq
from pydantic import ValidationError

from app.ai.providers.base import AIRecommendationProvider
from app.ai.schemas.care import AIAnalysisResponse
from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Text-only model — no vision needed for care/treatment analysis
GROQ_CARE_MODEL = "openai/gpt-oss-120b"

# Timeout for Groq API calls (seconds) — care analysis may be longer
GROQ_TIMEOUT = 90.0

# Max retry attempts for invalid LLM responses
MAX_RETRIES = 1


class GroqCareError(Exception):
    """Raised when Groq care analysis fails."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


# ── System Prompt ────────────────────────────────────────────────

_CARE_SYSTEM_PROMPT = """You are Plantify AI, a plant care specialist assistant.
You generate personalized care plans and treatment recommendations based on
plant identification data, health analysis results, and reference knowledge.

CRITICAL RULES:
- You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation.
- Follow the EXACT JSON schema provided. Do not add extra fields.
- Base your recommendations on the plant species, health data, and reference knowledge provided.
- If health analysis shows a problem, provide specific treatment instructions.
- If the plant is healthy, set problem.detected to false and treatment.required to false.
- Be specific and actionable in your recommendations — avoid vague advice.
- Include specific measurements, frequencies, and timeframes where possible.
- Your care recommendations should be personalized to the specific species, not generic."""


def _build_user_prompt(
    plant_data: dict,
    health_data: dict | None,
    knowledge_context: dict | None,
    scan_history: list[dict] | None = None,
) -> str:
    """Build the user prompt with all available context."""

    prompt_parts = []

    # ── Plant identification context
    prompt_parts.append("## Plant Information")
    prompt_parts.append(f"- Common Name: {plant_data.get('name', 'Unknown')}")
    prompt_parts.append(f"- Scientific Name: {plant_data.get('scientific_name', 'Unknown')}")
    if plant_data.get("family"):
        prompt_parts.append(f"- Family: {plant_data['family']}")
    if plant_data.get("genus"):
        prompt_parts.append(f"- Genus: {plant_data['genus']}")

    # ── Health analysis context
    if health_data:
        prompt_parts.append("\n## Current Health Analysis")
        prompt_parts.append(f"- Health Status: {health_data.get('health_status', 'unknown')}")
        prompt_parts.append(f"- Issue: {health_data.get('issue', 'None detected')}")
        prompt_parts.append(f"- Severity: {health_data.get('severity', 'unknown')}")
        prompt_parts.append(f"- Confidence: {health_data.get('confidence', 0)}")
        if health_data.get("symptoms"):
            prompt_parts.append(f"- Symptoms: {', '.join(health_data['symptoms'])}")
        if health_data.get("possible_causes"):
            prompt_parts.append(f"- Possible Causes: {', '.join(health_data['possible_causes'])}")

    # ── Knowledge context (from KnowledgeService)
    if knowledge_context:
        if knowledge_context.get("care_baseline"):
            prompt_parts.append("\n## Reference Care Data (use as baseline, personalize further)")
            baseline = knowledge_context["care_baseline"]
            for key, value in baseline.items():
                prompt_parts.append(f"- {key.title()}: {value}")

        if knowledge_context.get("common_issues"):
            prompt_parts.append("\n## Common Issues for This Plant Family")
            for issue in knowledge_context["common_issues"]:
                prompt_parts.append(
                    f"- {issue['name']} ({issue['category']}): {', '.join(issue.get('signs', []))}"
                )

        if knowledge_context.get("treatment_protocols"):
            prompt_parts.append("\n## Reference Treatment Protocols")
            for protocol in knowledge_context["treatment_protocols"]:
                prompt_parts.append(f"\n### {protocol['category']}")
                prompt_parts.append(f"Approach: {protocol.get('general_approach', '')}")
                if protocol.get("common_treatments"):
                    for treatment in protocol["common_treatments"][:3]:
                        prompt_parts.append(f"- {treatment}")

    # ── Scan history context
    if scan_history:
        prompt_parts.append("\n## Previous Scan History")
        for scan in scan_history[:5]:  # Limit to last 5 scans
            prompt_parts.append(
                f"- {scan.get('date', 'Unknown date')}: "
                f"{scan.get('health_status', 'Unknown')} — {scan.get('issue', 'N/A')}"
            )

    # ── Required output schema
    prompt_parts.append("""

## Required JSON Response

Respond with EXACTLY this JSON schema:
{
  "summary": "A concise 2-3 sentence summary of the plant's current condition and key care priorities.",
  "care": {
    "watering": "Specific watering instructions for this plant",
    "sunlight": "Specific light requirements",
    "temperature": "Ideal temperature range",
    "humidity": "Humidity needs and tips",
    "soil": "Soil type and composition",
    "fertilization": "Fertilizer type, amount, and schedule",
    "pruning": "When and how to prune"
  },
  "problem": {
    "detected": true or false,
    "name": "Name of the problem or empty string if healthy",
    "category": "one of: healthy, fungal_disease, bacterial_disease, viral_disease, pest_infestation, nutrient_deficiency, environmental_stress, overwatering, underwatering, root_rot, sunburn, other",
    "severity": "one of: none, low, medium, high, critical",
    "description": "Detailed description of the problem or empty string"
  },
  "treatment": {
    "required": true or false,
    "product_category": "Category of treatment product (e.g., fungicide) or empty string",
    "recommended_actions": ["Step 1", "Step 2", "..."],
    "frequency": "How often to apply treatment or empty string",
    "estimated_duration": "Expected recovery timeframe or empty string",
    "precautions": ["Precaution 1", "..."],
    "instructions": "Detailed treatment instructions paragraph or empty string"
  }
}

IMPORTANT:
- If the plant is healthy: set problem.detected=false, problem.category="healthy", problem.severity="none", treatment.required=false
- If a problem exists: set problem.detected=true and fill ALL treatment fields
- ALL fields are required. Use empty strings or empty arrays for inapplicable fields.
- Do NOT wrap the response in markdown code fences.""")

    return "\n".join(prompt_parts)


def _build_correction_prompt(error_message: str) -> str:
    """Build a follow-up prompt to correct an invalid LLM response."""
    return (
        f"Your previous response was invalid JSON or didn't match the required schema.\n"
        f"Error: {error_message}\n\n"
        f"Please respond again with ONLY a valid JSON object matching the exact schema "
        f"from the previous message. No markdown, no code fences, no explanation."
    )


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from LLM response."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n") if "\n" in cleaned else len(cleaned)
        cleaned = cleaned[first_newline + 1:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


class GroqCareProvider(AIRecommendationProvider):
    """
    Groq LLM provider for care and treatment recommendations.

    Uses openai/gpt-oss-120b (text-only) to generate structured
    care plans from identification + health data + knowledge context.

    Validation pipeline:
        Raw LLM text → strip fences → json.loads() → AIAnalysisResponse.model_validate()
        Only validated output is returned to the caller.
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        if not self.api_key:
            raise ValueError(
                "GROQ_API_KEY is not configured. "
                "Set it in your .env file to use care analysis."
            )
        self.client = AsyncGroq(api_key=self.api_key, timeout=GROQ_TIMEOUT)

    async def get_care_recommendations(
        self,
        plant_species: str,
        health_data: Optional[dict] = None,
        weather_data: Optional[dict] = None,
    ) -> dict[str, Any]:
        """
        Interface method from AIRecommendationProvider.
        Delegates to the full analyze() method.
        """
        plant_data = {"name": plant_species, "scientific_name": plant_species}
        result = await self.analyze(
            plant_data=plant_data,
            health_data=health_data,
        )
        return result

    async def analyze(
        self,
        plant_data: dict,
        health_data: dict | None = None,
        knowledge_context: dict | None = None,
        scan_history: list[dict] | None = None,
    ) -> dict[str, Any]:
        """
        Generate a full care + treatment analysis.

        Args:
            plant_data: Dict with name, scientific_name, family, genus.
            health_data: Dict from health analysis (health_status, issue, etc).
            knowledge_context: Dict from KnowledgeService.
            scan_history: List of previous scan summaries.

        Returns:
            Validated dict matching AIAnalysisResponse schema.

        Raises:
            GroqCareError: On API or validation errors.
        """
        user_prompt = _build_user_prompt(
            plant_data=plant_data,
            health_data=health_data,
            knowledge_context=knowledge_context,
            scan_history=scan_history,
        )

        messages = [
            {"role": "system", "content": _CARE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        # First attempt
        raw_text = await self._call_groq(messages)
        result, error = self._parse_and_validate(raw_text)

        if result:
            return result

        # Retry with correction prompt
        logger.warning(
            "First LLM response failed validation, retrying: %s", error
        )
        messages.append({"role": "assistant", "content": raw_text})
        messages.append({"role": "user", "content": _build_correction_prompt(error)})

        raw_text_retry = await self._call_groq(messages)
        result, error = self._parse_and_validate(raw_text_retry)

        if result:
            return result

        # Both attempts failed
        logger.error("Both LLM attempts failed validation: %s", error)
        raise GroqCareError(
            "AI returned an invalid response after retry. Please try again.",
            status_code=502,
        )

    async def _call_groq(self, messages: list[dict]) -> str:
        """Call the Groq API and return raw text response."""
        try:
            logger.info("Calling Groq API for care analysis (model=%s)", GROQ_CARE_MODEL)

            response = await self.client.chat.completions.create(
                model=GROQ_CARE_MODEL,
                messages=messages,
                temperature=0.3,
                max_tokens=2048,
            )

            raw_text = response.choices[0].message.content or ""
            logger.debug("Groq care response (first 500 chars): %s", raw_text[:500])
            return raw_text

        except Exception as e:
            error_msg = str(e)
            logger.exception("Groq care analysis API call failed: %s", error_msg)

            if "rate_limit" in error_msg.lower():
                raise GroqCareError(
                    "AI analysis rate limit reached. Please try again later.",
                    status_code=429,
                )
            if "timeout" in error_msg.lower():
                raise GroqCareError(
                    "AI analysis timed out. Please try again.",
                    status_code=504,
                )

            raise GroqCareError(
                f"Care analysis failed: {error_msg}",
                status_code=502,
            )

    def _parse_and_validate(
        self, raw_text: str
    ) -> tuple[dict | None, str | None]:
        """
        Parse LLM response and validate through Pydantic.

        Returns:
            (validated_dict, None) on success.
            (None, error_message) on failure.
        """
        # Strip markdown fences
        cleaned = _strip_markdown_fences(raw_text)

        # Parse JSON
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            return None, f"Invalid JSON: {str(e)}"

        # Validate through Pydantic schema
        try:
            validated = AIAnalysisResponse.model_validate(parsed)
            result = validated.model_dump()

            # Preserve raw response for auditing
            result["_raw_llm_response"] = parsed

            return result, None
        except ValidationError as e:
            return None, f"Schema validation failed: {str(e)}"
