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
    cart_decision_data: dict[str, Any]  # {product_id, quantity, reason, ...}
    cart_confirmation: str  # "pending" | "approved" | "declined"
    cart_item_added: dict[str, Any]  # result after successful cart addition
    buy_links: list[dict[str, Any]]  # external purchase links

    # ── Plant Memory (Loaded by load_plant_context) ──────────────
    # Plant identity
    plant_name: str
    plant_scientific_name: str
    plant_identification_confidence: float
    plant_primary_image: str
    # Scan history
    scan_history: list[dict[str, Any]]  # Last N scans with full details
    # Health history summary
    health_summary: dict[str, Any]  # {total_checks, status_distribution, common_issues, severity_distribution, latest_status, latest_issue}
    # Treatment history
    treatment_summary: dict[str, Any]  # {total_treatments, treatments, product_categories_recommended}
    # Recommended & purchased products
    cart_history: list[dict[str, Any]]  # Cart items from previous scans
    # Plant images
    plant_images: list[dict[str, Any]]

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
        "cart_decision_data": {},
        "cart_confirmation": "pending",
        "cart_item_added": {},
        "buy_links": [],
        "messages": [],
        "errors": [],
        # Plant memory fields (initialized empty, populated by load_plant_context)
        "plant_name": "",
        "plant_scientific_name": "",
        "plant_identification_confidence": 0.0,
        "plant_primary_image": "",
        "scan_history": [],
        "health_summary": {},
        "treatment_summary": {},
        "cart_history": [],
        "plant_images": [],
    }

