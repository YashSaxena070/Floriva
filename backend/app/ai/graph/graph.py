"""
LangGraph Workflow Definition for Plantify.

Constructs and compiles the StateGraph connecting:
START -> image_validation -> plant_identification ->
[Confidence Check Routing]
  ├── High Confidence -> health_analysis -> plant_analysis -> treatment_decision ->
  │   product_recommendation -> cart_decision -> human_confirmation -> add_to_cart -> END
  └── Low Confidence -> request_better_image -> END
"""

import logging
from langgraph.graph import StateGraph, START, END

from app.ai.graph.state import PlantifyGraphState
from app.ai.graph.nodes import (
    image_validation_node,
    plant_identification_node,
    request_better_image_node,
    health_analysis_node,
    plant_analysis_node,
    treatment_decision_node,
    product_recommendation_node,
    cart_decision_node,
    human_confirmation_node,
    add_to_cart_node,
)

logger = logging.getLogger(__name__)


def check_image_validation(state: PlantifyGraphState) -> str:
    """Route based on image validation status."""
    if not state.get("image_quality_passed", True) or state.get("requires_better_image"):
        return "request_better_image"
    return "plant_identification"


def check_identification_confidence(state: PlantifyGraphState) -> str:
    """
    Route based on plant identification confidence:
    - Low confidence or failure -> request_better_image
    - High confidence -> health_analysis
    """
    if state.get("requires_better_image") or state.get("low_confidence"):
        return "request_better_image"
    return "health_analysis"


def check_health_analysis_confidence(state: PlantifyGraphState) -> str:
    """
    Route based on health analysis result:
    - Low confidence (< 0.40) or required better image -> request_better_image
    - Healthy or Issue detected (with sufficient confidence) -> plant_analysis
    """
    confidence = state.get("disease_confidence", 0.0)
    if state.get("requires_better_image") or confidence < 0.40 or state.get("health_status") == "unknown":
        return "request_better_image"
    return "plant_analysis"


def check_treatment_requirement(state: PlantifyGraphState) -> str:
    """
    Route based on treatment requirement decision:
    - If treatment_required -> product_recommendation
    - If not treatment_required (healthy care plan completed) -> completed (END)
    """
    if state.get("treatment_required", False):
        return "product_recommendation"
    return "completed"


def create_plantify_graph() -> StateGraph:
    """
    Builds the uncompiled StateGraph for the Plantify AI Pipeline.
    """
    workflow = StateGraph(PlantifyGraphState)

    # ── Add Graph Nodes ─────────────────────────────────────────
    workflow.add_node("image_validation", image_validation_node)
    workflow.add_node("plant_identification", plant_identification_node)
    workflow.add_node("request_better_image", request_better_image_node)
    workflow.add_node("health_analysis", health_analysis_node)
    workflow.add_node("plant_analysis", plant_analysis_node)
    workflow.add_node("treatment_decision", treatment_decision_node)
    workflow.add_node("product_recommendation", product_recommendation_node)
    workflow.add_node("cart_decision", cart_decision_node)
    workflow.add_node("human_confirmation", human_confirmation_node)
    workflow.add_node("add_to_cart", add_to_cart_node)

    # ── Define Edge Sequence with Conditional Routing ───────────
    workflow.add_edge(START, "image_validation")

    # 1. Image validation conditional branch
    workflow.add_conditional_edges(
        "image_validation",
        check_image_validation,
        {
            "request_better_image": "request_better_image",
            "plant_identification": "plant_identification",
        },
    )

    # 2. Plant identification confidence router
    workflow.add_conditional_edges(
        "plant_identification",
        check_identification_confidence,
        {
            "request_better_image": "request_better_image",
            "health_analysis": "health_analysis",
        },
    )

    # 3. Health analysis confidence router (Healthy / Issue detected -> plant_analysis, Low confidence -> request_better_image)
    workflow.add_conditional_edges(
        "health_analysis",
        check_health_analysis_confidence,
        {
            "request_better_image": "request_better_image",
            "plant_analysis": "plant_analysis",
        },
    )

    # Low confidence terminal route
    workflow.add_edge("request_better_image", END)

    # Plant analysis proceeds to treatment decision
    workflow.add_edge("plant_analysis", "treatment_decision")

    # 4. Treatment decision conditional branch (treatment needed -> product_recommendation, healthy -> END)
    workflow.add_conditional_edges(
        "treatment_decision",
        check_treatment_requirement,
        {
            "product_recommendation": "product_recommendation",
            "completed": END,
        },
    )

    # Product recommendation sequence
    workflow.add_edge("product_recommendation", "cart_decision")
    workflow.add_edge("cart_decision", "human_confirmation")
    workflow.add_edge("human_confirmation", "add_to_cart")
    workflow.add_edge("add_to_cart", END)

    return workflow


# Compiled singleton graph
plantify_graph = create_plantify_graph().compile()
