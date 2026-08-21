"""
Groq LLM provider for plant care and treatment recommendations.

Optimized for minimal token usage, multi-model fallback, rate-limit backoff,
and deterministic botanical care plan synthesis.
"""

import asyncio
import json
import logging
from typing import Any, Optional

from groq import AsyncGroq
from pydantic import ValidationError

from app.ai.providers.base import AIRecommendationProvider
from app.ai.schemas.care import AIAnalysisResponse
from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Active fast Groq models
GROQ_CARE_MODELS = [
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.6-27b",
    "groq/compound-mini",
]

GROQ_TIMEOUT = 25.0


class GroqCareError(Exception):
    """Raised when Groq care analysis fails."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


_CARE_SYSTEM_PROMPT = (
    "Plantify AI Botanist. Output ONLY valid JSON matching the requested schema. "
    "No markdown code fences, no extra commentary."
)


def _build_user_prompt(
    plant_data: dict,
    health_data: dict | None,
    knowledge_context: dict | None = None,
    scan_history: list[dict] | None = None,
) -> str:
    """Build a compact, highly structured prompt to minimize token consumption."""
    name = plant_data.get("name", "Plant")
    sci = plant_data.get("scientific_name", "")
    status = (health_data.get("health_status") if health_data else "healthy") or "healthy"
    issue = (health_data.get("issue") if health_data else "None") or "None"
    sev = (health_data.get("severity") if health_data else "low") or "low"
    is_problem = "true" if status in ("diseased", "warning") else "false"

    cat = "fungal_disease" if any(w in issue.lower() for w in ("mildew", "spot", "blight", "fung", "rot", "rust", "mold")) else ("healthy" if is_problem == "false" else "environmental_stress")
    prod_cat = "fungicide" if cat == "fungal_disease" else ("fertilizer" if "chlorosis" in issue.lower() or "yellow" in issue.lower() else ("pest_control" if "pest" in issue.lower() or "mite" in issue.lower() or "aphid" in issue.lower() else "none"))

    return f"""Plant: {name} ({sci}) | Status: {status} | Issue: {issue} | Severity: {sev}
Generate JSON:
{{
  "summary": "Brief 2-sentence care and recovery summary.",
  "care": {{"watering": "...", "sunlight": "...", "temperature": "...", "humidity": "...", "soil": "...", "fertilization": "...", "pruning": "..."}},
  "problem": {{"detected": {is_problem}, "name": "{issue if is_problem == 'true' else ''}", "category": "{cat}", "severity": "{sev}", "description": "Short note"}},
  "treatment": {{"required": {is_problem}, "product_category": "{prod_cat}", "urgency": "{"within_24h" if is_problem == 'true' else 'none'}", "instructions": ["Step 1", "Step 2"], "recommended_actions": ["Action 1"], "precautions": ["Precaution 1"]}}
}}"""


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences if wrapped in them."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            cleaned = cleaned[first_newline + 1:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def _get_species_care_plan_fallback(plant_data: dict, health_data: dict | None) -> dict[str, Any]:
    """Fallback generator for botanical care plan and treatments."""
    name = plant_data.get("name") or "Plant"
    scientific = plant_data.get("scientific_name") or ""
    p_lower = (name + " " + scientific).lower()

    status = (health_data.get("health_status") if health_data else "healthy") or "healthy"
    issue = (health_data.get("issue") if health_data else "") or "Healthy Growth"
    is_problem = status in ("diseased", "warning")

    if "rose" in p_lower:
        return {
            "summary": f"{name} requires full sunlight (6+ hours) and root-level watering to prevent foliar fungal infections.",
            "care": {
                "watering": "Water deeply at root base early in morning, allowing top 2 inches of soil to dry.",
                "sunlight": "Direct sunlight, minimum 6 hours daily.",
                "temperature": "15°C - 28°C (59°F - 82°F).",
                "humidity": "40% - 60% with good cross-ventilation.",
                "soil": "Rich, loamy, well-draining soil with organic compost.",
                "fertilization": "Apply balanced rose fertilizer every 3–4 weeks during bloom season.",
                "pruning": "Prune spent blooms (deadheading) and crowded inner branches in spring.",
            },
            "problem": {
                "detected": is_problem,
                "name": issue if is_problem else "",
                "category": "fungal_disease" if is_problem else "healthy",
                "severity": "medium" if is_problem else "none",
                "description": f"Targeted care for {issue}" if is_problem else "No active pathogen detected.",
            },
            "treatment": {
                "required": is_problem,
                "product_category": "fungicide" if is_problem else "none",
                "urgency": "within_24h" if is_problem else "none",
                "instructions": [
                    "Prune affected or discolored petals/leaves with clean shears.",
                    "Spray foliage with organic copper or neem fungicide spray every 7 days.",
                    "Avoid overhead hydration to keep leaves dry.",
                ] if is_problem else [],
                "recommended_actions": [
                    "Isolate plant from dense foliage areas.",
                    "Apply protective bio-fungicide.",
                ] if is_problem else ["Maintain weekly light and hydration routine."],
                "precautions": [
                    "Do not spray in direct midday sun.",
                    "Sterilize pruning tools between cuts.",
                ],
            },
        }

    return {
        "summary": f"{name} is adapting well. Maintain consistent hydration and proper lighting to ensure optimal vigor.",
        "care": {
            "watering": "Water thoroughly when top 1-2 inches of soil feel dry to touch.",
            "sunlight": "Bright, indirect sunlight for 4-6 hours daily.",
            "temperature": "18°C - 26°C.",
            "humidity": "50% - 70%.",
            "soil": "Well-draining potting mix with perlite.",
            "fertilization": "Diluted balanced liquid fertilizer monthly during active growth.",
            "pruning": "Trim dead or yellowing leaves to encourage healthy foliage.",
        },
        "problem": {
            "detected": is_problem,
            "name": issue if is_problem else "",
            "category": "fungal_disease" if is_problem else "healthy",
            "severity": "low" if is_problem else "none",
            "description": f"Condition: {issue}" if is_problem else "Plant is healthy.",
        },
        "treatment": {
            "required": is_problem,
            "product_category": "fungicide" if is_problem else "none",
            "urgency": "within_week" if is_problem else "none",
            "instructions": [
                "Remove yellow or spotted leaves.",
                "Ensure container drainage is unimpeded.",
            ] if is_problem else [],
            "recommended_actions": [
                "Adjust watering schedule to prevent moisture accumulation.",
            ],
            "precautions": [
                "Avoid standing water in plant saucer.",
            ],
        },
    }


class GroqCareProvider(AIRecommendationProvider):
    """
    Groq LLM provider with token-optimized prompts, rate-limit backoff,
    and automatic species care synthesis.
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.GROQ_API_KEY
        self.client = AsyncGroq(api_key=self.api_key)

    async def analyze(
        self,
        plant_data: dict,
        health_data: dict | None = None,
        knowledge_context: dict | None = None,
        scan_history: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Generate personalized care plan with token-efficient prompt and multi-model fallback."""
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

        # Try active models with rate-limit backoff
        for model_name in GROQ_CARE_MODELS:
            try:
                logger.info("Calling Groq Care LLM (%s) for %s", model_name, plant_data.get("name"))
                response = await self.client.chat.completions.create(
                    model=model_name,
                    messages=messages,
                    temperature=0.2,
                    max_tokens=800,
                )

                raw_text = response.choices[0].message.content or ""
                result, error = self._parse_and_validate(raw_text)
                if result:
                    return result
            except Exception as err:
                err_msg = str(err)
                logger.warning("Groq model %s failed (%s), trying backoff/next model", model_name, err_msg)
                if "rate_limit" in err_msg.lower():
                    await asyncio.sleep(0.35)

        # Fallback to botanical synthesis so pipeline never fails
        logger.info("Using species care plan synthesis fallback for %s", plant_data.get("name"))
        fallback = _get_species_care_plan_fallback(plant_data, health_data)
        validated = AIAnalysisResponse.model_validate(fallback)
        return validated.model_dump()

    def _parse_and_validate(
        self, raw_text: str
    ) -> tuple[dict | None, str | None]:
        """Parse LLM response and validate through Pydantic."""
        cleaned = _strip_markdown_fences(raw_text)
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as e:
            return None, f"Invalid JSON: {str(e)}"

        try:
            validated = AIAnalysisResponse.model_validate(parsed)
            result = validated.model_dump()
            result["_raw_llm_response"] = parsed
            return result, None
        except ValidationError as e:
            return None, f"Schema validation failed: {str(e)}"
