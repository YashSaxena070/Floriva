"""
LangChain tools for querying plant history and context.

These tools provide the AI with access to a plant's complete history:
- Plant identity
- Scan history
- Health analysis history
- Disease history
- Care plans
- Treatment history
- Recommended products
- Purchased products (cart items)
- Watering history
- Fertilization history

CRITICAL DESIGN RULE:
    The LLM is NOT the source of plant history truth.
    Database = plant history truth.
    LLM = reasoning, contextualization, and explanation.
"""

import json
import logging
import uuid
from typing import Optional, Literal
from datetime import datetime

from langchain_core.tools import tool, BaseTool, ToolException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, desc

from app.models.plant import Plant
from app.models.plant_scan import PlantScan
from app.models.health_analysis import HealthAnalysis
from app.models.identification_result import IdentificationResult
from app.models.care_recommendation import CareRecommendation
from app.models.plant_image import PlantImage
from app.models.cart import Cart, CartItem
from app.models.product import Product

logger = logging.getLogger(__name__)


# ── Tool Input Schemas ─────────────────────────────────────────────

class GetPlantHistoryInput(BaseModel):
    """Input for get_plant_history tool."""
    plant_id: str = Field(
        ..., description="UUID of the plant to retrieve history for."
    )
    include_scans: bool = Field(
        default=True, description="Include scan history."
    )
    include_health: bool = Field(
        default=True, description="Include health analysis history."
    )
    include_care_plans: bool = Field(
        default=True, description="Include care recommendations."
    )
    include_images: bool = Field(
        default=False, description="Include plant images."
    )
    include_treatments: bool = Field(
        default=True, description="Include treatment/care history."
    )
    include_cart_items: bool = Field(
        default=True, description="Include purchased/recommended products from cart."
    )
    limit: int = Field(
        default=10, ge=1, le=50, description="Maximum number of scans to return."
    )


class GetLatestScanInput(BaseModel):
    """Input for get_latest_scan tool."""
    plant_id: str = Field(
        ..., description="UUID of the plant."
    )
    include_full: bool = Field(
        default=True, description="Include full health analysis and identification."
    )


class GetPlantIdentityInput(BaseModel):
    """Input for get_plant_identity tool."""
    plant_id: str = Field(
        ..., description="UUID of the plant."
    )


class SearchPlantKnowledgeInput(BaseModel):
    """Input for search_plant_knowledge tool."""
    species: Optional[str] = Field(
        default=None, description="Common or scientific name of the plant."
    )
    family: Optional[str] = Field(
        default=None, description="Plant family (e.g., Araceae, Rosaceae)."
    )
    issue: Optional[str] = Field(
        default=None, description="Health issue or symptom to search for."
    )
    problem_category: Optional[str] = Field(
        default=None, description="Problem category (e.g., fungal_disease, pest_infestation)."
    )


# ── Serialization Helpers ──────────────────────────────────────────

def _serialize_scan(scan: PlantScan) -> dict:
    """Serialize a scan with its health analyses and identification."""
    result = {
        "scan_id": str(scan.id),
        "image_url": scan.image_url,
        "status": scan.status.value,
        "created_at": scan.created_at.isoformat() if scan.created_at else None,
        "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
        "identification": None,
        "health_analyses": [],
        "care_recommendation": None,
    }

    # Identification
    if scan.identification_result:
        ir = scan.identification_result
        result["identification"] = {
            "common_name": ir.common_name,
            "scientific_name": ir.scientific_name,
            "family": ir.family,
            "genus": ir.genus,
            "confidence": ir.confidence,
            "common_names": ir.common_names,
            "alternatives": ir.alternatives,
            "provider": ir.provider,
            "created_at": ir.created_at.isoformat() if ir.created_at else None,
        }

    # Health analyses
    for ha in scan.health_analyses or []:
        result["health_analyses"].append({
            "health_status": ha.health_status,
            "issue": ha.issue,
            "confidence": ha.confidence,
            "severity": ha.severity,
            "symptoms": ha.symptoms,
            "possible_causes": ha.possible_causes,
            "created_at": ha.created_at.isoformat() if ha.created_at else None,
        })

    # Care recommendation
    if scan.care_recommendation:
        cr = scan.care_recommendation
        result["care_recommendation"] = {
            "summary": cr.summary,
            "care_data": cr.care_data,
            "problem_detected": cr.problem_detected,
            "problem_category": cr.problem_category,
            "problem_severity": cr.problem_severity,
            "treatment_data": cr.treatment_data,
            "provider": cr.provider,
            "created_at": cr.created_at.isoformat() if cr.created_at else None,
        }

    return result


def _serialize_plant(plant: Plant) -> dict:
    """Serialize a plant with basic info."""
    return {
        "plant_id": str(plant.id),
        "name": plant.name,
        "scientific_name": plant.scientific_name,
        "identification_confidence": plant.identification_confidence,
        "image_url": plant.image_url,
        "created_at": plant.created_at.isoformat() if plant.created_at else None,
        "updated_at": plant.updated_at.isoformat() if plant.updated_at else None,
    }


def _serialize_cart_items(cart_items: list[CartItem]) -> list[dict]:
    """Serialize cart items with product details."""
    result = []
    for item in cart_items:
        product = item.product
        result.append({
            "cart_item_id": str(item.id),
            "product_id": str(item.product_id),
            "product_name": product.name if product else "Unknown",
            "product_brand": product.brand if product else None,
            "product_category": product.category.name if product and product.category else None,
            "price_at_addition": float(item.price_at_addition),
            "quantity": item.quantity,
            "recommendation_reason": item.recommendation_reason,
            "scan_id": str(item.scan_id) if item.scan_id else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })
    return result


def _serialize_plant_images(images: list[PlantImage]) -> list[dict]:
    """Serialize plant images."""
    return [{
        "image_id": str(img.id),
        "image_url": img.image_url,
        "image_type": img.image_type,
        "created_at": img.created_at.isoformat() if img.created_at else None,
    } for img in images]


# ── Tool Factory ──────────────────────────────────────────────────


def create_plant_tools(db: Session) -> list[BaseTool]:
    """
    Factory that creates LangChain tools for plant history queries.

    Args:
        db: SQLAlchemy Session for database queries.

    Returns:
        List of LangChain tools for plant history.
    """

    # ── Tool 1: get_plant_history ─────────────────────────────────

    @tool("get_plant_history", args_schema=GetPlantHistoryInput)
    def get_plant_history(
        plant_id: str,
        include_scans: bool = True,
        include_health: bool = True,
        include_care_plans: bool = True,
        include_images: bool = False,
        include_treatments: bool = True,
        include_cart_items: bool = True,
        limit: int = 10,
    ) -> str:
        """
        Get the complete history for a plant.

        Retrieves:
        - Plant identity (name, scientific name, confidence)
        - Scan history (last N scans with identification, health analysis, care plans)
        - Health analysis history (disease progression, severity trends)
        - Treatment history (care recommendations, product applications)
        - Recommended/purchased products (from cart)
        - Watering/fertilization history (from care plans)

        Use this tool to understand the plant's health trajectory and
        previous treatments before making new recommendations.
        """
        try:
            plant_uuid = uuid.UUID(plant_id)
        except ValueError:
            return json.dumps({
                "error": f"Invalid plant ID format: {plant_id}. Must be a valid UUID.",
                "plant": None,
                "scans": [],
            })

        # Fetch plant
        plant = db.query(Plant).filter(Plant.id == plant_uuid).first()
        if not plant:
            return json.dumps({
                "error": f"Plant with ID {plant_id} not found.",
                "plant": None,
                "scans": [],
            })

        result = {
            "plant": _serialize_plant(plant),
            "scans": [],
            "health_summary": {},
            "treatment_summary": {},
            "cart_items": [],
            "images": [],
        }

        # Fetch scans with relationships
        if include_scans:
            scans = (
                db.query(PlantScan)
                .options(
                    joinedload(PlantScan.health_analyses),
                    joinedload(PlantScan.identification_result),
                    joinedload(PlantScan.care_recommendation),
                )
                .filter(PlantScan.plant_id == plant_uuid)
                .order_by(desc(PlantScan.created_at))
                .limit(limit)
                .all()
            )
            result["scans"] = [_serialize_scan(s) for s in scans]

        # Fetch images
        if include_images:
            images = db.query(PlantImage).filter(PlantImage.plant_id == plant_uuid).order_by(desc(PlantImage.created_at)).all()
            result["images"] = _serialize_plant_images(images)

        # Build health summary from scans
        if include_health and result["scans"]:
            health_statuses = []
            issues = []
            severities = []
            for scan in result["scans"]:
                for ha in scan["health_analyses"] or []:
                    if ha.get("health_status"):
                        health_statuses.append(ha["health_status"])
                    if ha.get("issue") and ha["issue"] != "No issues detected":
                        issues.append(ha["issue"])
                    if ha.get("severity"):
                        severities.append(ha["severity"])

            # Count statuses
            status_counts = {}
            for s in health_statuses:
                status_counts[s] = status_counts.get(s, 0) + 1

            # Count issues
            issue_counts = {}
            for i in issues:
                issue_counts[i] = issue_counts.get(i, 0) + 1

            # Count severities
            severity_counts = {}
            for s in severities:
                severity_counts[s] = severity_counts.get(s, 0) + 1

            result["health_summary"] = {
                "total_health_checks": len(health_statuses),
                "status_distribution": status_counts,
                "common_issues": dict(sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]),
                "severity_distribution": severity_counts,
                "latest_status": health_statuses[0] if health_statuses else None,
                "latest_issue": issues[0] if issues else None,
            }

        # Build treatment summary from care recommendations
        if include_treatments and result["scans"]:
            treatments = []
            products_recommended = []
            for scan in result["scans"]:
                cr = scan.get("care_recommendation")
                if cr:
                    if cr.get("treatment_data", {}).get("required"):
                        treatments.append({
                            "scan_id": scan["scan_id"],
                            "date": scan["created_at"],
                            "problem_category": cr.get("problem_category"),
                            "problem_severity": cr.get("problem_severity"),
                            "product_category": cr.get("treatment_data", {}).get("product_category"),
                            "recommended_actions": cr.get("treatment_data", {}).get("recommended_actions", []),
                            "frequency": cr.get("treatment_data", {}).get("frequency"),
                            "duration": cr.get("treatment_data", {}).get("estimated_duration"),
                        })
                    if cr.get("treatment_data", {}).get("product_category"):
                        products_recommended.append(cr["treatment_data"]["product_category"])

            # Count product categories
            product_cat_counts = {}
            for p in products_recommended:
                product_cat_counts[p] = product_cat_counts.get(p, 0) + 1

            result["treatment_summary"] = {
                "total_treatments": len(treatments),
                "treatments": treatments[:5],  # Last 5 treatments
                "product_categories_recommended": product_cat_counts,
            }

        # Fetch cart items for this plant
        if include_cart_items:
            # Get cart items that reference scans of this plant
            plant_scan_ids = [uuid.UUID(s["scan_id"]) for s in result["scans"]]
            if plant_scan_ids:
                cart_items = (
                    db.query(CartItem)
                    .join(CartItem.cart)
                    .join(CartItem.product)
                    .options(joinedload(CartItem.product).joinedload(Product.category))
                    .filter(CartItem.scan_id.in_(plant_scan_ids))
                    .order_by(desc(CartItem.created_at))
                    .all()
                )
                result["cart_items"] = _serialize_cart_items(cart_items)

        logger.info(
            "Tool[get_plant_history]: plant_id=%s → scans=%d, health_checks=%d, treatments=%d, cart_items=%d",
            plant_id,
            len(result["scans"]),
            result["health_summary"].get("total_health_checks", 0),
            result["treatment_summary"].get("total_treatments", 0),
            len(result["cart_items"]),
        )
        return json.dumps(result, default=str)

    # ── Tool 2: get_latest_scan ───────────────────────────────────

    @tool("get_latest_scan", args_schema=GetLatestScanInput)
    def get_latest_scan(
        plant_id: str,
        include_full: bool = True,
    ) -> str:
        """
        Get the most recent scan for a plant.

        Returns the latest scan with full identification, health analysis,
        and care recommendation data.
        """
        try:
            plant_uuid = uuid.UUID(plant_id)
        except ValueError:
            return json.dumps({
                "error": f"Invalid plant ID format: {plant_id}.",
                "scan": None,
            })

        scan = (
            db.query(PlantScan)
            .options(
                joinedload(PlantScan.health_analyses),
                joinedload(PlantScan.identification_result),
                joinedload(PlantScan.care_recommendation),
            )
            .filter(PlantScan.plant_id == plant_uuid)
            .order_by(desc(PlantScan.created_at))
            .first()
        )

        if not scan:
            return json.dumps({
                "error": f"No scans found for plant {plant_id}.",
                "scan": None,
            })

        if include_full:
            result = {"scan": _serialize_scan(scan)}
        else:
            result = {
                "scan": {
                    "scan_id": str(scan.id),
                    "image_url": scan.image_url,
                    "status": scan.status.value,
                    "created_at": scan.created_at.isoformat() if scan.created_at else None,
                }
            }

        logger.info("Tool[get_latest_scan]: plant_id=%s → scan_id=%s", plant_id, scan.id)
        return json.dumps(result, default=str)

    # ── Tool 3: get_plant_identity ────────────────────────────────

    @tool("get_plant_identity", args_schema=GetPlantIdentityInput)
    def get_plant_identity(plant_id: str) -> str:
        """
        Get the plant's identity information.

        Returns the plant's common name, scientific name, identification
        confidence, and primary image.
        """
        try:
            plant_uuid = uuid.UUID(plant_id)
        except ValueError:
            return json.dumps({
                "error": f"Invalid plant ID format: {plant_id}.",
                "plant": None,
            })

        plant = db.query(Plant).filter(Plant.id == plant_uuid).first()
        if not plant:
            return json.dumps({
                "error": f"Plant with ID {plant_id} not found.",
                "plant": None,
            })

        result = {"plant": _serialize_plant(plant)}
        logger.info("Tool[get_plant_identity]: plant_id=%s → %s", plant_id, plant.name)
        return json.dumps(result, default=str)

    # ── Tool 4: search_plant_knowledge ────────────────────────────

    @tool("search_plant_knowledge", args_schema=SearchPlantKnowledgeInput)
    def search_plant_knowledge(
        species: Optional[str] = None,
        family: Optional[str] = None,
        issue: Optional[str] = None,
        problem_category: Optional[str] = None,
    ) -> str:
        """
        Search the curated plant knowledge base for care baselines,
        common issues, and treatment protocols.

        This tool queries the embedded knowledge base (future: vector store)
        for validated plant care information. Use this to ground recommendations
        in established horticultural knowledge.
        """
        # Import here to avoid circular imports
        from app.ai.services.knowledge_service import PLANT_KNOWLEDGE_BASE, TREATMENT_KNOWLEDGE_BASE

        result = {
            "care_baseline": None,
            "common_issues": [],
            "treatment_protocols": [],
            "matched_family": None,
        }

        # Resolve family
        family_key = None
        if family:
            family_lower = family.lower().strip()
            if family_lower in PLANT_KNOWLEDGE_BASE:
                family_key = family_lower

        if not family_key and species:
            species_lower = species.lower().strip()
            for key, data in PLANT_KNOWLEDGE_BASE.items():
                members = [m.lower() for m in data.get("common_members", [])]
                if any(species_lower in m or m in species_lower for m in members):
                    family_key = key
                    break

        if family_key:
            kb = PLANT_KNOWLEDGE_BASE[family_key]
            result["care_baseline"] = kb.get("care_baseline")
            result["common_issues"] = kb.get("common_issues", [])
            result["matched_family"] = kb.get("family", family_key)

        # Get treatment knowledge if issue/category provided
        if problem_category or issue:
            categories_to_check = []
            if problem_category:
                categories_to_check.append(problem_category.lower().strip())
            if issue:
                issue_lower = issue.lower()
                if "fung" in issue_lower or "spot" in issue_lower or "mildew" in issue_lower or "rust" in issue_lower or "blight" in issue_lower:
                    categories_to_check.append("fungal_disease")
                elif "pest" in issue_lower or "mite" in issue_lower or "aphid" in issue_lower or "scale" in issue_lower or "bug" in issue_lower:
                    categories_to_check.append("pest_infestation")
                elif "rot" in issue_lower or "overwater" in issue_lower:
                    categories_to_check.append("root_rot")
                elif "deficien" in issue_lower or "chloros" in issue_lower or "yellow" in issue_lower:
                    categories_to_check.append("nutrient_deficiency")
                elif "bacteri" in issue_lower:
                    categories_to_check.append("bacterial_disease")
                else:
                    categories_to_check.append("environmental_stress")

            for cat in categories_to_check:
                if cat in TREATMENT_KNOWLEDGE_BASE:
                    treatment_data = TREATMENT_KNOWLEDGE_BASE[cat]
                    result["treatment_protocols"].append({
                        "category": cat,
                        **treatment_data,
                    })

        logger.info(
            "Tool[search_plant_knowledge]: species=%s, family=%s, issue=%s, category=%s",
            species, family, issue, problem_category,
        )
        return json.dumps(result, default=str)

    return [get_plant_history, get_latest_scan, get_plant_identity, search_plant_knowledge]


# Export the factory
__all__ = ["create_plant_tools"]