"""
LangGraph State definition for the Plantify AI Pipeline.

Defines the centralized state flowing through each node in the graph.
All data stored in the state consists of primitive types, dictionaries,
or lists (references, IDs, and metadata) — NO raw SQLAlchemy DB objects
or large raw image binaries are placed in state.
"""

from typing import Annotated, Any, Optional, TypedDict
from operator import add


class PlantifyGraphState(TypedDict, total=False):
    """
    State container for the end-to-end plant analysis and recommendation graph.
    """

    # ── Context Identifiers & Images ────────────────────────────
    user_id: str
    plant_id: str
    scan_id: str
    image_urls: list[str]

    # ── Image Validation & Quality ──────────────────────────────
    image_quality_passed: bool

    # ── Plant Identification ────────────────────────────────────
    plant_species: str
    scientific_name: str
    identification_confidence: float
    alternative_species: list[dict[str, Any]]
    low_confidence: bool
    requires_better_image: bool

    # ── Health & Disease Analysis ───────────────────────────────
    health_status: str
    disease: str
    disease_confidence: float
    severity: str
    symptoms: list[str]
    possible_causes: list[str]

    # ── AI Plant Care & Treatment Plan ──────────────────────────
    care_plan: dict[str, Any]
    treatment_required: bool
    problem_category: str
    required_product_category: str
    treatment_reason: str
    treatment_confidence: float

    # ── Product Recommendations ─────────────────────────────────
    product_candidates: list[dict[str, Any]]
    recommended_products: list[dict[str, Any]]

    # ── Cart & Human Interaction ────────────────────────────────
    cart_action: str  # "none" | "add" | "skip"

    # ── Diagnostic & Trace Messages ─────────────────────────────
    messages: Annotated[list[str], add]
    errors: Annotated[list[str], add]


def create_initial_state(
    user_id: str = "",
    plant_id: str = "",
    scan_id: str = "",
    image_urls: Optional[list[str]] = None,
) -> PlantifyGraphState:
    """Helper to initialize an empty/default state dictionary."""
    return {
        "user_id": user_id,
        "plant_id": plant_id,
        "scan_id": scan_id,
        "image_urls": image_urls or [],
        "image_quality_passed": True,
        "plant_species": "",
        "scientific_name": "",
        "identification_confidence": 0.0,
        "alternative_species": [],
        "low_confidence": False,
        "requires_better_image": False,
        "health_status": "unknown",
        "disease": "",
        "disease_confidence": 0.0,
        "severity": "none",
        "symptoms": [],
        "possible_causes": [],
        "care_plan": {},
        "treatment_required": False,
        "problem_category": "healthy",
        "required_product_category": "none",
        "treatment_reason": "",
        "treatment_confidence": 0.9,
        "product_candidates": [],
        "recommended_products": [],
        "cart_action": "none",
        "messages": [],
        "errors": [],
    }
