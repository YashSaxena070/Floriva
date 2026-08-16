"""
LangGraph Workflow Definition for Plantify.

Constructs and compiles the StateGraph connecting:
START -> image_validation -> plant_identification ->
[Confidence Check Routing]
  ├── High Confidence -> health_analysis -> plant_analysis -> treatment_decision ->
  │   [Treatment Routing]
  │   ├── treatment_required -> product_recommendation -> cart_decision ->
  │   │   [Cart Routing]
  │   │   ├── cart_action="add" -> human_confirmation (INTERRUPT) -> add_to_cart -> END
  │   │   └── cart_action="none" -> END
  │   └── healthy -> END
  └── Low Confidence -> request_better_image -> END

Part 6 — Full graph with human-in-the-loop:
    The graph pauses at human_confirmation via interrupt_before.
    The API returns the cart_decision_data to the frontend.
    When the user approves/declines, the graph resumes.
"""

import logging
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from app.ai.graph.state import PlantifyGraphState
from app.ai.graph.nodes import (
    load_plant_context_node,
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


def check_cart_action(state: PlantifyGraphState) -> str:
    """
    Route based on cart decision:
    - If cart_action="add" -> human_confirmation (will interrupt)
    - Otherwise -> END (no product to add)
    """
    if state.get("cart_action") == "add":
        return "human_confirmation"
    return "completed"


def create_plantify_graph() -> StateGraph:
    """
    Builds the uncompiled StateGraph for the Plantify AI Pipeline.

    Part 6 Graph Flow (with Plant Memory):
        START
          ↓
        load_plant_context      ← NEW: Load plant history & context
          ↓
        image_validation
          ↓ (conditional)
        plant_identification
          ↓ (conditional)
        health_analysis
          ↓ (conditional)
        plant_analysis
          ↓
        treatment_decision
          ├── treatment_required=True  → product_recommendation
          │     ↓
          │   cart_decision
          │     ├── cart_action="add" → human_confirmation (INTERRUPT)
          │     │     ↓ (after user approval)
          │     │   add_to_cart → END
          │     └── cart_action="none" → END
          └── treatment_required=False → END
    """
    workflow = StateGraph(PlantifyGraphState)

    # ── Add Graph Nodes ─────────────────────────────────────────
    workflow.add_node("load_plant_context", load_plant_context_node)
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
    workflow.add_edge(START, "load_plant_context")
    workflow.add_edge("load_plant_context", "image_validation")

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

    # 3. Health analysis confidence router
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

    # 4. Treatment decision → product_recommendation or END
    workflow.add_conditional_edges(
        "treatment_decision",
        check_treatment_requirement,
        {
            "product_recommendation": "product_recommendation",
            "completed": END,
        },
    )

    # 5. Product recommendation → cart_decision
    workflow.add_edge("product_recommendation", "cart_decision")

    # 6. Cart decision → human_confirmation or END
    workflow.add_conditional_edges(
        "cart_decision",
        check_cart_action,
        {
            "human_confirmation": "human_confirmation",
            "completed": END,
        },
    )

    # 7. Human confirmation → add_to_cart
    workflow.add_edge("human_confirmation", "add_to_cart")

    # 8. Add to cart → END
    workflow.add_edge("add_to_cart", END)

    return workflow


# ── Checkpointer for human-in-the-loop ──────────────────────────
# MemorySaver stores graph state in memory for interrupt/resume.
# In production, replace with a PostgreSQL-backed checkpointer.
memory_checkpointer = MemorySaver()


# ── Compiled graph with human-in-the-loop interrupt ─────────────
# The graph pauses BEFORE human_confirmation runs, allowing the
# API to return the cart_decision_data to the frontend. When the
# user approves, the API resumes the graph with the updated state.
plantify_graph = create_plantify_graph().compile(
    checkpointer=memory_checkpointer,
    interrupt_before=["human_confirmation"],
)

