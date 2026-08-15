"""
AI Analysis Service — high-level orchestrator for care & treatment analysis.

This is the main entry point for the care/treatment pipeline. It:
1. Gathers all context (identification, health analysis, plant history)
2. Fetches curated knowledge from the KnowledgeService
3. Sends everything to the GroqCareProvider
4. Returns the validated, structured result

This service does NOT directly call the LLM or touch the database.
It delegates to the provider (Groq) for LLM calls and returns
validated data to the ScanService which handles persistence.
"""

import logging
from typing import Any, Optional

from app.ai.providers.groq_care_provider import GroqCareProvider, GroqCareError
from app.ai.services.knowledge_service import KnowledgeService

logger = logging.getLogger(__name__)


class AIAnalysisError(Exception):
    """Raised when the AI analysis pipeline fails."""

    def __init__(self, message: str, status_code: int | None = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AIAnalysisService:
    """
    Orchestrates the full care & treatment analysis pipeline.

    Pipeline:
        Plant Identification + Health Analysis + Plant History
                                ↓
                    KnowledgeService.get_plant_knowledge()
                                ↓
                    GroqCareProvider.analyze()
                                ↓
                    Validated AIAnalysisResponse dict
    """

    def __init__(self):
        self.care_provider = GroqCareProvider()
        self.knowledge_service = KnowledgeService()

    async def analyze(
        self,
        plant_data: dict,
        health_data: Optional[dict] = None,
        scan_history: Optional[list[dict]] = None,
    ) -> dict[str, Any]:
        """
        Run the full AI analysis pipeline.

        Args:
            plant_data: Dict with plant identification info:
                {
                    "name": "Snake Plant",
                    "scientific_name": "Dracaena trifasciata",
                    "family": "Asparagaceae",
                    "genus": "Dracaena"
                }
            health_data: Dict from health analysis (optional):
                {
                    "health_status": "diseased",
                    "issue": "Leaf spot detected",
                    "severity": "medium",
                    "confidence": 0.85,
                    "symptoms": ["brown spots on leaves"],
                    "possible_causes": ["fungal infection"]
                }
            scan_history: List of dicts summarizing previous scans (optional):
                [
                    {
                        "date": "2024-01-15",
                        "health_status": "healthy",
                        "issue": "No issues"
                    }
                ]

        Returns:
            Validated dict matching AIAnalysisResponse schema:
            {
                "summary": "...",
                "care": { watering, sunlight, temperature, ... },
                "problem": { detected, name, category, severity, description },
                "treatment": { required, product_category, recommended_actions, ... },
                "_raw_llm_response": { ... }
            }

        Raises:
            AIAnalysisError: On pipeline failures.
        """
        try:
            # 1. Gather knowledge context
            knowledge_context = await self._gather_knowledge(
                plant_data=plant_data,
                health_data=health_data,
            )

            logger.info(
                "AI analysis pipeline: species=%s, family=%s, has_health=%s, "
                "has_knowledge=%s, history_count=%d",
                plant_data.get("name", "Unknown"),
                plant_data.get("family"),
                health_data is not None,
                knowledge_context.get("care_baseline") is not None,
                len(scan_history or []),
            )

            # 2. Call care provider with all context
            result = await self.care_provider.analyze(
                plant_data=plant_data,
                health_data=health_data,
                knowledge_context=knowledge_context,
                scan_history=scan_history,
            )

            logger.info(
                "AI analysis completed: problem_detected=%s, category=%s",
                result.get("problem", {}).get("detected", False),
                result.get("problem", {}).get("category", "healthy"),
            )

            return result

        except GroqCareError as e:
            logger.error("Care provider error: %s", e.message)
            raise AIAnalysisError(
                message=e.message,
                status_code=e.status_code,
            )
        except Exception as e:
            logger.exception("Unexpected error in AI analysis pipeline")
            raise AIAnalysisError(
                message=f"AI analysis failed: {str(e)}",
                status_code=500,
            )

    async def _gather_knowledge(
        self,
        plant_data: dict,
        health_data: Optional[dict],
    ) -> dict:
        """
        Gather knowledge context from the KnowledgeService.

        Combines plant-level knowledge (care baselines) with
        issue-specific treatment knowledge if a health problem is detected.
        """
        # Get plant family/species knowledge
        issues = []
        if health_data:
            if health_data.get("issue"):
                issues.append(health_data["issue"])
            if health_data.get("possible_causes"):
                issues.extend(health_data["possible_causes"])

        knowledge = await self.knowledge_service.get_plant_knowledge(
            species=plant_data.get("name"),
            family=plant_data.get("family"),
            issues=issues or None,
        )

        # If health analysis detected a specific problem category,
        # also fetch targeted treatment knowledge
        if health_data and health_data.get("health_status") in ("warning", "diseased"):
            # Infer problem category from health data
            issue_text = (health_data.get("issue") or "").lower()
            possible_causes = health_data.get("possible_causes") or []

            category = self._infer_problem_category(issue_text, possible_causes)
            if category:
                treatment_knowledge = await self.knowledge_service.get_treatment_knowledge(
                    problem_category=category,
                    species=plant_data.get("name"),
                )
                if not knowledge.get("treatment_protocols"):
                    knowledge["treatment_protocols"] = []
                knowledge["treatment_protocols"].append(treatment_knowledge)

        return knowledge

    @staticmethod
    def _infer_problem_category(
        issue_text: str,
        possible_causes: list[str],
    ) -> str | None:
        """
        Infer the most likely problem category from health analysis text.

        Used to fetch targeted treatment knowledge from KnowledgeService.
        """
        combined = (issue_text + " " + " ".join(possible_causes)).lower()

        category_keywords = {
            "fungal_disease": ["fungal", "fungus", "mildew", "blight", "rust", "leaf spot"],
            "bacterial_disease": ["bacterial", "bacteria", "canker", "fire blight"],
            "viral_disease": ["viral", "virus", "mosaic", "mottle"],
            "pest_infestation": ["pest", "insect", "mite", "aphid", "mealybug", "scale", "whitefly"],
            "nutrient_deficiency": ["nutrient", "deficiency", "nitrogen", "iron", "calcium", "chlorosis"],
            "overwatering": ["overwater", "waterlog", "root rot", "soggy"],
            "underwatering": ["underwater", "dehydrat", "drought", "wilting", "dry"],
            "environmental_stress": ["stress", "draft", "temperature", "light burn"],
            "sunburn": ["sunburn", "sun scorch", "bleach"],
            "root_rot": ["root rot", "rotting roots"],
        }

        for category, keywords in category_keywords.items():
            if any(kw in combined for kw in keywords):
                return category

        return None
