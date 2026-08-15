"""
Unit tests for Part 4: Plant Analysis, Knowledge Retrieval, Care Plan, and Treatment Decision.
"""

import pytest
from pydantic import ValidationError

from app.ai.schemas.care import (
    PlantCarePlan,
    TreatmentDecisionOutput,
    REQUIRED_PRODUCT_CATEGORIES,
)
from app.ai.services.knowledge_service import PlantKnowledgeRetriever
from app.ai.graph.state import create_initial_state
from app.ai.graph.nodes import treatment_decision_node
from app.ai.graph.graph import check_treatment_requirement


def test_plant_care_plan_schema_valid():
    """Verify PlantCarePlan schema validation with complete care fields."""
    care = PlantCarePlan.model_validate({
        "summary": "Snake plant is exceptionally hardy and drought-tolerant.",
        "watering": "Water every 2-3 weeks, allowing soil to completely dry out.",
        "sunlight": "Thrives in low to bright indirect light.",
        "humidity": "Tolerates average to low home humidity (30-50%).",
        "temperature": "65-85°F (18-29°C). Protect from drafts below 50°F.",
        "soil": "Fast-draining cactus and succulent mix with perlite.",
        "fertilization": "Feed with diluted liquid fertilizer once in spring.",
        "pruning": "Trim outer damaged leaves at base with sterilized shears.",
        "general_care": ["Wipe leaves occasionally", "Rotate pot for even growth"],
    })
    assert care.watering.startswith("Water every")
    assert care.sunlight.startswith("Thrives")
    assert len(care.general_care) == 2


def test_treatment_decision_output_schema_valid():
    """Verify TreatmentDecisionOutput schema validation for disease and healthy cases."""
    # Fungal infection decision
    fungal_decision = TreatmentDecisionOutput.model_validate({
        "treatment_required": True,
        "problem_category": "fungal_disease",
        "required_product_category": "fungicide",
        "treatment_reason": "Active fungal pathogen requiring copper or neem spray.",
        "treatment_confidence": 0.91,
        "recommended_actions": ["Apply foliar fungicide spray every 7-10 days"],
        "precautions": ["Spray outdoors or in well-ventilated area"],
    })
    assert fungal_decision.treatment_required is True
    assert fungal_decision.required_product_category == "fungicide"

    # Healthy plant decision
    healthy_decision = TreatmentDecisionOutput.model_validate({
        "treatment_required": False,
        "problem_category": "healthy",
        "required_product_category": "none",
        "treatment_reason": "Plant is healthy; no chemical intervention required.",
        "treatment_confidence": 0.95,
        "recommended_actions": ["Maintain normal watering schedule"],
    })
    assert healthy_decision.treatment_required is False
    assert healthy_decision.required_product_category == "none"


def test_treatment_decision_output_invalid_category():
    """Verify that invalid product categories are rejected."""
    with pytest.raises(ValidationError):
        TreatmentDecisionOutput.model_validate({
            "treatment_required": True,
            "required_product_category": "MAGIC_POTION_UNKNOWN",
        })


@pytest.mark.asyncio
async def test_plant_knowledge_retriever():
    """Verify PlantKnowledgeRetriever returns grounded care and treatment reference data."""
    retriever = PlantKnowledgeRetriever()

    # Retrieve for Snake Plant (Asparagaceae)
    knowledge = await retriever.get_relevant_knowledge(
        species="Snake Plant",
        health_status="healthy",
    )
    assert "care_baseline" in knowledge
    assert "watering" in knowledge["care_baseline"]
    assert "known_issues" in knowledge

    # Retrieve for diseased Monstera (Araceae)
    diseased_knowledge = await retriever.get_relevant_knowledge(
        species="Monstera Deliciosa",
        health_status="diseased",
        issue="Powdery Mildew",
    )
    assert diseased_knowledge["treatment_context"] is not None
    assert diseased_knowledge["treatment_context"]["category"] == "fungal_disease"


@pytest.mark.asyncio
async def test_treatment_decision_node_evaluation():
    """Verify treatment_decision_node sets normalized category and does not invent real products."""
    # Test fungal disease scenario
    state_fungal = create_initial_state()
    state_fungal["treatment_required"] = True
    state_fungal["problem_category"] = "fungal_disease"
    state_fungal["required_product_category"] = "copper_spray"
    state_fungal["disease"] = "Black Spot"
    state_fungal["severity"] = "medium"

    result_fungal = await treatment_decision_node(state_fungal)
    assert result_fungal["treatment_required"] is True
    assert result_fungal["required_product_category"] == "fungicide"
    assert "Active treatment needed" in result_fungal["treatment_reason"]

    # Test nutrient deficiency scenario
    state_nutrient = create_initial_state()
    state_nutrient["treatment_required"] = True
    state_nutrient["problem_category"] = "nutrient_deficiency"
    state_nutrient["required_product_category"] = "balanced_fertilizer"
    state_nutrient["disease"] = "Nitrogen Deficiency"

    result_nutrient = await treatment_decision_node(state_nutrient)
    assert result_nutrient["treatment_required"] is True
    assert result_nutrient["required_product_category"] == "fertilizer"

    # Test healthy scenario
    state_healthy = create_initial_state()
    state_healthy["treatment_required"] = False
    state_healthy["problem_category"] = "healthy"

    result_healthy = await treatment_decision_node(state_healthy)
    assert result_healthy["treatment_required"] is False
    assert result_healthy["required_product_category"] == "none"


def test_treatment_requirement_routing():
    """Verify graph routing after treatment_decision node."""
    # Treatment needed -> product_recommendation
    state_needs_treatment = create_initial_state()
    state_needs_treatment["treatment_required"] = True
    assert check_treatment_requirement(state_needs_treatment) == "product_recommendation"

    # Healthy -> completed (END)
    state_healthy = create_initial_state()
    state_healthy["treatment_required"] = False
    assert check_treatment_requirement(state_healthy) == "completed"
