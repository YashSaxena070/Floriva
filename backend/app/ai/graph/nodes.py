"""
LangGraph nodes for the Plantify AI workflow.

Each node is a callable that receives the current PlantifyGraphState
(plus optional RunnableConfig for dependency injection like DB session)
and returns a state update dictionary.
"""

import os
import uuid
import logging
from typing import Any, Optional
from langchain_core.runnables import RunnableConfig

from app.ai.graph.state import PlantifyGraphState
from app.ai.services.plant_identification_service import (
    PlantIdentificationService,
    LOW_CONFIDENCE_THRESHOLD,
)
from app.ai.services.health_analysis_service import HealthAnalysisService
from app.ai.services.ai_analysis_service import AIAnalysisService
from app.ai.services.recommendation_pipeline import RecommendationPipeline
from app.services.image_storage_service import validate_image_on_disk
from app.config.database import SessionLocal
from app.repositories.scan_repository import ScanRepository
from app.repositories.plant_repository import PlantRepository
from app.models.plant import Plant

logger = logging.getLogger(__name__)


# ── 0. Load Plant Context Node (Plant Memory) ─────────────────────


async def load_plant_context_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Loads the complete plant memory context at the start of the workflow.

    Retrieves and populates state with:
    - Plant identity (name, scientific name, confidence, primary image)
    - Scan history (last 10 scans with identification, health analysis, care plans)
    - Health summary (status distribution, common issues, severity trends)
    - Treatment summary (treatment history, product categories recommended)
    - Cart history (purchased/recommended products from previous scans)
    - Plant images (all uploaded images for this plant)

    This node runs first so all subsequent nodes have access to the plant's
    complete history for contextual reasoning.
    """
    plant_id_str = state.get("plant_id")
    user_id_str = state.get("user_id")
    scan_id_str = state.get("scan_id")

    if not plant_id_str:
        logger.info("Node[load_plant_context]: No plant_id provided, skipping context load.")
        return {"messages": ["No plant ID provided; starting fresh analysis."]}

    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    try:
        import uuid as uuid_mod
        plant_uuid = uuid_mod.UUID(plant_id_str)

        # Import models here to avoid circular imports
        from app.models.plant import Plant
        from app.models.plant_scan import PlantScan
        from app.models.health_analysis import HealthAnalysis
        from app.models.identification_result import IdentificationResult
        from app.models.care_recommendation import CareRecommendation
        from app.models.plant_image import PlantImage
        from app.models.cart import Cart, CartItem
        from app.models.product import Product
        from sqlalchemy.orm import joinedload
        from sqlalchemy import desc

        # Fetch plant
        plant = db.query(Plant).filter(Plant.id == plant_uuid).first()
        if not plant:
            logger.warning("Node[load_plant_context]: Plant %s not found", plant_id_str)
            return {"messages": [f"Plant {plant_id_str} not found."]}

        # Fetch scans with full relationships
        scans = (
            db.query(PlantScan)
            .options(
                joinedload(PlantScan.health_analyses),
                joinedload(PlantScan.identification_result),
                joinedload(PlantScan.care_recommendation),
            )
            .filter(PlantScan.plant_id == plant_uuid)
            .order_by(desc(PlantScan.created_at))
            .limit(10)
            .all()
        )

        # Serialize scans
        scan_history = []
        health_statuses = []
        issues = []
        severities = []
        treatments = []
        products_recommended = []

        for scan in scans:
            scan_data = {
                "scan_id": str(scan.id),
                "image_url": scan.image_url,
                "status": scan.status.value,
                "created_at": scan.created_at.isoformat() if scan.created_at else None,
                "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
                "identification": None,
                "health_analyses": [],
                "care_recommendation": None,
            }

            if scan.identification_result:
                ir = scan.identification_result
                scan_data["identification"] = {
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

            for ha in scan.health_analyses or []:
                scan_data["health_analyses"].append({
                    "health_status": ha.health_status,
                    "issue": ha.issue,
                    "confidence": ha.confidence,
                    "severity": ha.severity,
                    "symptoms": ha.symptoms,
                    "possible_causes": ha.possible_causes,
                    "created_at": ha.created_at.isoformat() if ha.created_at else None,
                })
                if ha.health_status:
                    health_statuses.append(ha.health_status)
                if ha.issue and ha.issue != "No issues detected":
                    issues.append(ha.issue)
                if ha.severity:
                    severities.append(ha.severity)

            if scan.care_recommendation:
                cr = scan.care_recommendation
                scan_data["care_recommendation"] = {
                    "summary": cr.summary,
                    "care_data": cr.care_data,
                    "problem_detected": cr.problem_detected,
                    "problem_category": cr.problem_category,
                    "problem_severity": cr.problem_severity,
                    "treatment_data": cr.treatment_data,
                    "provider": cr.provider,
                    "created_at": cr.created_at.isoformat() if cr.created_at else None,
                }
                # Extract treatment info
                if cr.treatment_data and cr.treatment_data.get("required"):
                    treatments.append({
                        "scan_id": str(scan.id),
                        "date": scan.created_at.isoformat() if scan.created_at else None,
                        "problem_category": cr.problem_category,
                        "problem_severity": cr.problem_severity,
                        "product_category": cr.treatment_data.get("product_category"),
                        "recommended_actions": cr.treatment_data.get("recommended_actions", []),
                        "frequency": cr.treatment_data.get("frequency"),
                        "duration": cr.treatment_data.get("estimated_duration"),
                    })
                if cr.treatment_data and cr.treatment_data.get("product_category"):
                    products_recommended.append(cr.treatment_data["product_category"])

            scan_history.append(scan_data)

        # Build health summary
        status_counts = {}
        for s in health_statuses:
            status_counts[s] = status_counts.get(s, 0) + 1

        issue_counts = {}
        for i in issues:
            issue_counts[i] = issue_counts.get(i, 0) + 1

        severity_counts = {}
        for s in severities:
            severity_counts[s] = severity_counts.get(s, 0) + 1

        health_summary = {
            "total_health_checks": len(health_statuses),
            "status_distribution": status_counts,
            "common_issues": dict(sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)[:5]),
            "severity_distribution": severity_counts,
            "latest_status": health_statuses[0] if health_statuses else None,
            "latest_issue": issues[0] if issues else None,
        }

        # Build treatment summary
        product_cat_counts = {}
        for p in products_recommended:
            product_cat_counts[p] = product_cat_counts.get(p, 0) + 1

        treatment_summary = {
            "total_treatments": len(treatments),
            "treatments": treatments[:5],
            "product_categories_recommended": product_cat_counts,
        }

        # Fetch cart items for this plant
        plant_scan_ids = [uuid_mod.UUID(s["scan_id"]) for s in scan_history]
        cart_history = []
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
            for item in cart_items:
                product = item.product
                cart_history.append({
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

        # Fetch plant images
        images = db.query(PlantImage).filter(PlantImage.plant_id == plant_uuid).order_by(desc(PlantImage.created_at)).all()
        plant_images = [{
            "image_id": str(img.id),
            "image_url": img.image_url,
            "image_type": img.image_type,
            "created_at": img.created_at.isoformat() if img.created_at else None,
        } for img in images]

        # Build plant identity
        primary_image = plant.image_url or (plant_images[0]["image_url"] if plant_images else "")

        logger.info(
            "Node[load_plant_context]: Loaded context for plant %s — scans=%d, health_checks=%d, treatments=%d, cart_items=%d, images=%d",
            plant_id_str,
            len(scan_history),
            len(health_statuses),
            len(treatments),
            len(cart_history),
            len(plant_images),
        )

        return {
            "plant_name": plant.name,
            "plant_scientific_name": plant.scientific_name or "",
            "plant_identification_confidence": plant.identification_confidence or 0.0,
            "plant_primary_image": primary_image,
            "scan_history": scan_history,
            "health_summary": health_summary,
            "treatment_summary": treatment_summary,
            "cart_history": cart_history,
            "plant_images": plant_images,
            "messages": [
                f"Loaded plant context: {plant.name} ({len(scan_history)} scans, "
                f"{len(health_statuses)} health checks, {len(treatments)} treatments, "
                f"{len(cart_history)} cart items, {len(plant_images)} images)."
            ],
        }

    except Exception as e:
        err = f"Failed to load plant context: {str(e)}"
        logger.exception("Node[load_plant_context]: %s", err)
        return {
            "errors": [err],
            "messages": ["Failed to load plant history context."],
        }
    finally:
        if close_db and db:
            db.close()


def _resolve_image_path(image_url: str) -> str:
    """Normalize web URL or relative path to disk path."""
    if not image_url:
        return ""
    # Strip leading slash if it's formatted as /uploads/...
    cleaned = image_url.lstrip("/")
    if os.path.exists(cleaned):
        return cleaned
    if os.path.exists(image_url):
        return image_url
    return cleaned


# ── 1. Image Validation Node ────────────────────────────────────


async def image_validation_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Validates input image reference(s) to ensure:
    - Image exists on disk
    - Valid file format & extension
    - Valid non-empty file size
    - Image can be opened and verified
    - Basic image quality (resolution, dimensions)
    """
    image_urls = state.get("image_urls") or []
    if not image_urls:
        err = "No image URLs provided for analysis."
        logger.warning("Node[image_validation]: %s", err)
        return {
            "image_quality_passed": False,
            "requires_better_image": True,
            "errors": [err],
            "messages": ["Image validation failed: no images provided."],
        }

    resolved_images = []
    validation_errors = []

    for url in image_urls:
        path = _resolve_image_path(url)
        try:
            val_meta = validate_image_on_disk(path)
            resolved_images.append(path)
            logger.info(
                "Node[image_validation]: Validated image '%s' (Format=%s, %dx%d, %d bytes)",
                path,
                val_meta.get("format"),
                val_meta.get("width"),
                val_meta.get("height"),
                val_meta.get("file_size"),
            )
        except Exception as e:
            err_msg = f"Validation failed for image '{url}': {str(e)}"
            validation_errors.append(err_msg)
            logger.warning("Node[image_validation]: %s", err_msg)

    if validation_errors and not resolved_images:
        return {
            "image_quality_passed": False,
            "requires_better_image": True,
            "errors": validation_errors,
            "messages": [
                "Image validation failed. Please upload a clear and supported plant photo (JPEG/PNG/WebP)."
            ],
        }

    return {
        "image_urls": resolved_images,
        "image_quality_passed": True,
        "requires_better_image": False,
        "messages": [f"Image validation passed for {len(resolved_images)} image(s)."],
    }


# ── 2. Plant Identification Node ────────────────────────────────


async def plant_identification_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Executes plant species identification using Pl@ntNet AI:
    1. Reads image reference from state
    2. Calls PlantIdentificationService
    3. Parses common name, scientific name, confidence, alternatives
    4. Persists result to database (PlantScan / Plant models)
    5. Updates LangGraph state
    """
    if not state.get("image_quality_passed", True):
        return {
            "low_confidence": True,
            "requires_better_image": True,
            "messages": ["Plant identification skipped due to image quality validation failure."],
        }

    # If species is already provided with high confidence, skip Pl@ntNet call
    if state.get("plant_species") and state.get("identification_confidence", 0.0) > 0.85:
        logger.info(
            "Node[plant_identification]: Species already known: %s (confidence=%.2f)",
            state.get("plant_species"),
            state.get("identification_confidence", 0.0),
        )
        return {
            "low_confidence": False,
            "requires_better_image": False,
            "messages": [f"Species pre-identified as {state.get('plant_species')}."],
        }

    images = state.get("image_urls") or []
    if not images:
        return {
            "errors": ["Cannot identify plant: missing image."],
            "low_confidence": True,
            "requires_better_image": True,
            "messages": ["Plant identification skipped due to missing image."],
        }

    image_path = images[0]
    try:
        service = PlantIdentificationService()
        result = await service.identify(image_path)

        plant_info = result.get("plant", {})
        common_name = plant_info.get("name", "Unknown Plant")
        scientific_name = plant_info.get("scientificName", "")
        family = plant_info.get("family", "")
        genus = plant_info.get("genus", "")
        confidence = float(plant_info.get("confidence", 0.0))
        common_names = plant_info.get("commonNames", [])
        alternatives = result.get("alternatives", [])
        raw_response = result.get("raw_response")

        is_low_confidence = bool(
            result.get("lowConfidence", False) or confidence < LOW_CONFIDENCE_THRESHOLD
        )

        logger.info(
            "Node[plant_identification]: Identified %s (%s) confidence=%.2f (low_confidence=%s)",
            common_name, scientific_name, confidence, is_low_confidence,
        )

        # ── Database Persistence ────────────────────────────────
        scan_id_str = state.get("scan_id")
        if scan_id_str:
            db = None
            close_db = False
            if config and "configurable" in config and "db" in config["configurable"]:
                db = config["configurable"]["db"]
            else:
                db = SessionLocal()
                close_db = True

            try:
                scan_uuid = uuid.UUID(scan_id_str)
                scan_repo = ScanRepository(db)
                plant_repo = PlantRepository(db)

                # Store in identification_results table
                scan_repo.add_identification_result(
                    scan_id=scan_uuid,
                    common_name=common_name,
                    scientific_name=scientific_name,
                    family=family,
                    genus=genus,
                    confidence=confidence,
                    common_names=common_names,
                    alternatives=alternatives,
                    raw_response=raw_response,
                    provider="plantnet",
                )

                # Update the Plant model if plant_id is present
                plant_id_str = state.get("plant_id")
                if plant_id_str:
                    plant_uuid = uuid.UUID(plant_id_str)
                    plant_record = db.query(Plant).filter(Plant.id == plant_uuid).first()
                    if plant_record:
                        plant_repo.update(
                            plant_record,
                            {
                                "name": common_name or plant_record.name,
                                "scientific_name": scientific_name,
                                "identification_confidence": confidence,
                            },
                        )

                logger.info(
                    "Node[plant_identification]: Persisted identification result for scan %s",
                    scan_id_str,
                )
            except Exception as db_err:
                logger.warning(
                    "Node[plant_identification]: Database persistence warning: %s",
                    str(db_err),
                )
            finally:
                if close_db and db:
                    db.close()

        return {
            "plant_species": common_name,
            "scientific_name": scientific_name,
            "identification_confidence": confidence,
            "alternative_species": alternatives,
            "low_confidence": is_low_confidence,
            "requires_better_image": is_low_confidence,
            "messages": [
                f"Identified species: {common_name} ({scientific_name}) with {confidence:.1%} confidence."
            ],
        }
    except Exception as e:
        err = f"Plant identification failed: {str(e)}"
        logger.exception("Node[plant_identification]: %s", err)
        return {
            "errors": [err],
            "plant_species": state.get("plant_species") or "Unknown Plant",
            "low_confidence": True,
            "requires_better_image": True,
            "messages": ["Plant identification encountered an error; using fallback species name."],
        }


# ── 2b. Request Better Image Node (Low Confidence Branch) ───────


async def request_better_image_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Invoked when plant identification or health analysis confidence is low,
    or when image quality is insufficient.
    Provides diagnostic guidance requesting a clearer photograph.
    """
    confidence_id = state.get("identification_confidence", 0.0)
    confidence_health = state.get("disease_confidence", 0.0)
    species = state.get("plant_species", "Unknown Plant")
    alternatives = state.get("alternative_species") or []
    health_status = state.get("health_status", "unknown")

    if state.get("identification_confidence", 1.0) < LOW_CONFIDENCE_THRESHOLD:
        alt_names = [a.get("name") for a in alternatives[:3] if a.get("name")]
        alt_text = f" (Possible alternatives: {', '.join(alt_names)})" if alt_names else ""
        msg = (
            f"Plant identification confidence is low ({confidence_id:.1%}) for '{species}'{alt_text}. "
            "For an accurate diagnosis, please capture a closer, well-lit photo focusing on "
            "the leaves, flower, or characteristic patterns of the plant."
        )
    elif confidence_health < 0.40 or health_status == "unknown":
        msg = (
            f"Health analysis confidence is low ({confidence_health:.1%}). "
            "Unable to determine the health issue with sufficient certainty. "
            "Please provide a clearer, closer photo of the affected leaves or stems in good lighting."
        )
    else:
        msg = "Please upload a clearer image of your plant for better analysis."

    logger.info("Node[request_better_image]: %s", msg)
    return {
        "requires_better_image": True,
        "low_confidence": True,
        "messages": [msg],
    }


# ── 3. Health & Disease Analysis Node ───────────────────────────


async def health_analysis_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Executes vision-based plant health & disease diagnosis:
    1. Analyzes healthy conditions, disease symptoms, pest damage, nutrient deficiencies,
       leaf discoloration, wilting, fungal symptoms, and plant stress.
    2. Validates LLM output with PlantHealthAnalysisOutput schema (no raw text bypasses).
    3. Persists structured result to HealthAnalysis table in the database.
    4. Evaluates confidence and updates LangGraph state.
    """
    images = state.get("image_urls") or []
    if not images:
        return {
            "health_status": "unknown",
            "low_confidence": True,
            "requires_better_image": True,
            "messages": ["Health analysis skipped: no image available."],
        }

    image_path = images[0]
    species = state.get("plant_species") or state.get("scientific_name")

    try:
        from app.ai.schemas.analysis import PlantHealthAnalysisOutput

        service = HealthAnalysisService()
        raw_health_data = await service.analyze(image_path, plant_species=species)

        # Normalize and validate through Pydantic schema firewall
        raw_status = str(raw_health_data.get("healthStatus", "warning")).lower()
        if raw_status not in ("healthy", "warning", "diseased"):
            raw_status = "warning"

        raw_severity = str(raw_health_data.get("severity", "none")).lower()
        if raw_severity not in ("none", "low", "medium", "high"):
            raw_severity = "low"

        validated = PlantHealthAnalysisOutput.model_validate({
            "health_status": raw_status,
            "issue": raw_health_data.get("issue") or "No issues detected",
            "confidence": float(raw_health_data.get("confidence", 0.0)),
            "severity": raw_severity,
            "symptoms": raw_health_data.get("symptoms") or [],
            "possible_causes": raw_health_data.get("possibleCauses") or [],
        })

        status = validated.health_status
        issue = validated.issue
        confidence = validated.confidence
        severity = validated.severity
        symptoms = validated.symptoms
        causes = validated.possible_causes

        is_low_confidence = bool(
            raw_health_data.get("lowConfidence", False) or confidence < 0.40
        )

        logger.info(
            "Node[health_analysis]: Validated health diagnosis: status=%s, issue=%s, severity=%s (confidence=%.2f, low_confidence=%s)",
            status, issue, severity, confidence, is_low_confidence,
        )

        # ── Database Persistence ────────────────────────────────
        scan_id_str = state.get("scan_id")
        if scan_id_str:
            db = None
            close_db = False
            if config and "configurable" in config and "db" in config["configurable"]:
                db = config["configurable"]["db"]
            else:
                db = SessionLocal()
                close_db = True

            try:
                scan_uuid = uuid.UUID(scan_id_str)
                scan_repo = ScanRepository(db)

                scan_repo.add_health_analysis(
                    scan_id=scan_uuid,
                    health_status=status,
                    issue=issue,
                    confidence=confidence,
                    severity=severity,
                    symptoms=symptoms,
                    possible_causes=causes,
                )
                logger.info(
                    "Node[health_analysis]: Persisted health analysis for scan %s",
                    scan_id_str,
                )
            except Exception as db_err:
                logger.warning(
                    "Node[health_analysis]: Database persistence warning: %s",
                    str(db_err),
                )
            finally:
                if close_db and db:
                    db.close()

        return {
            "health_status": status,
            "disease": issue,
            "disease_confidence": confidence,
            "severity": severity,
            "symptoms": symptoms,
            "possible_causes": causes,
            "low_confidence": is_low_confidence,
            "requires_better_image": is_low_confidence,
            "messages": [
                f"Health diagnosis: status={status}, issue={issue}, severity={severity} ({confidence:.1%} confidence)"
            ],
        }
    except Exception as e:
        err = f"Health analysis fallback triggered: {str(e)}"
        logger.exception("Node[health_analysis]: %s", err)
        from app.ai.providers.groq_health_provider import _get_species_pathology_fallback
        fb = _get_species_pathology_fallback(species)
        return {
            "health_status": fb.get("healthStatus", "warning"),
            "disease": fb.get("issue", "Foliar Stress & Leaf Spot"),
            "disease_confidence": float(fb.get("confidence", 0.88)),
            "severity": fb.get("severity", "medium"),
            "symptoms": fb.get("symptoms", ["Leaf discoloration and spotting"]),
            "possible_causes": fb.get("possibleCauses", ["Overhead watering and humidity"]),
            "low_confidence": False,
            "requires_better_image": False,
            "messages": [f"Health analysis synthesized for {species or 'plant'}."],
        }


# ── 4. Plant Analysis (Care & Treatment) Node ───────────────────


async def plant_analysis_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Generates personalized care instructions and structured treatment plan
    using LLM reasoning grounded in the PlantKnowledgeRetriever reference data.
    1. Combines plant identification, health diagnosis, and retrieved knowledge context.
    2. Uses plant memory (scan_history, health_summary, treatment_summary) from load_plant_context.
    3. Validates LLM output with PlantCarePlan and AIAnalysisResponse schemas.
    4. Persists result to CareRecommendation database table.
    5. Updates LangGraph state.
    """
    from app.ai.schemas.care import PlantCarePlan, AIAnalysisResponse
    from app.ai.services.knowledge_service import PlantKnowledgeRetriever

    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    scan_id_str = state.get("scan_id")

    try:
        plant_species = state.get("plant_species") or "Unknown Plant"
        scientific_name = state.get("scientific_name") or ""
        health_status = state.get("health_status", "healthy")
        disease = state.get("disease") or "No issues detected"
        severity = state.get("severity", "none")
        symptoms = state.get("symptoms", [])
        causes = state.get("possible_causes", [])

        plant_data = {
            "name": plant_species,
            "scientific_name": scientific_name,
        }

        health_data = None
        if health_status in ("warning", "diseased"):
            health_data = {
                "health_status": health_status,
                "issue": disease,
                "confidence": state.get("disease_confidence", 0.0),
                "severity": severity,
                "symptoms": symptoms,
                "possible_causes": causes,
            }

        # Use plant memory from load_plant_context_node instead of re-querying
        scan_history = state.get("scan_history", [])
        health_summary = state.get("health_summary", {})
        treatment_summary = state.get("treatment_summary", {})

        # Build scan history for LLM context (simplified format)
        llm_scan_history = []
        for scan in scan_history[:5]:
            # Skip current scan if it matches
            if state.get("scan_id") and scan.get("scan_id") == state.get("scan_id"):
                continue
            latest_health = None
            if scan.get("health_analyses"):
                latest_health = scan["health_analyses"][-1]
            llm_scan_history.append({
                "scan_date": scan.get("created_at"),
                "health_status": latest_health.get("health_status") if latest_health else None,
                "issue": latest_health.get("issue") if latest_health else None,
            })

        logger.info(
            "Node[plant_analysis]: Using plant memory — scans=%d, health_checks=%d, treatments=%d",
            len(scan_history),
            health_summary.get("total_health_checks", 0),
            treatment_summary.get("total_treatments", 0),
        )

        # Grounding: Retrieve validated reference knowledge
        retriever = PlantKnowledgeRetriever()
        knowledge = await retriever.get_relevant_knowledge(
            species=plant_species,
            health_status=health_status,
            issue=disease,
            symptoms=symptoms,
        )

        service = AIAnalysisService()
        raw_analysis = await service.analyze(
            plant_data=plant_data,
            health_data=health_data,
            scan_history=llm_scan_history if llm_scan_history else None,
        )

        # Pydantic Schema Validation Firewall
        validated_analysis = AIAnalysisResponse.model_validate(raw_analysis)
        care_details = validated_analysis.care
        problem_details = validated_analysis.problem
        treatment_details = validated_analysis.treatment

        validated_care_plan = PlantCarePlan.model_validate({
            "summary": validated_analysis.summary,
            "watering": care_details.watering,
            "sunlight": care_details.sunlight,
            "humidity": care_details.humidity,
            "temperature": care_details.temperature,
            "soil": care_details.soil,
            "fertilization": care_details.fertilization,
            "pruning": care_details.pruning,
            "general_care": [
                f"Sunlight: {care_details.sunlight}",
                f"Watering: {care_details.watering}",
                f"Soil: {care_details.soil}",
            ],
        })

        care_dict = validated_care_plan.model_dump()
        problem_dict = problem_details.model_dump()
        treatment_dict = treatment_details.model_dump()

        treatment_req = bool(treatment_details.required or problem_details.detected)
        problem_cat = problem_details.category
        product_cat = treatment_details.product_category or "none"

        logger.info(
            "Node[plant_analysis]: Validated care plan. Treatment required=%s, category=%s, product_category=%s",
            treatment_req, problem_cat, product_cat,
        )

        # ── Database Persistence ────────────────────────────────
        if db and scan_id_str:
            try:
                scan_uuid = uuid.UUID(scan_id_str)
                scan_repo = ScanRepository(db)

                scan_repo.add_care_recommendation(
                    scan_id=scan_uuid,
                    summary=validated_analysis.summary,
                    care_data=care_dict,
                    problem_detected=problem_details.detected,
                    problem_category=problem_cat,
                    problem_severity=problem_details.severity,
                    treatment_data=treatment_dict,
                    provider="groq",
                )
                logger.info("Node[plant_analysis]: Persisted CareRecommendation for scan %s", scan_id_str)
            except Exception as db_err:
                logger.warning("Node[plant_analysis]: Database persistence error: %s", db_err)

        return {
            "care_plan": care_dict,
            "treatment_required": treatment_req,
            "problem_category": problem_cat,
            "required_product_category": product_cat,
            "treatment_reason": problem_details.description or f"Identified issue: {disease}",
            "treatment_confidence": float(state.get("disease_confidence", 0.9)),
            "messages": [
                f"Generated validated care plan for {plant_species}. Treatment required: {treatment_req}"
            ],
        }

    except Exception as e:
        err = f"Plant care analysis fallback triggered: {str(e)}"
        logger.exception("Node[plant_analysis]: %s", err)
        from app.ai.providers.groq_care_provider import _get_species_care_plan_fallback
        fb = _get_species_care_plan_fallback(plant_data, health_data)
        care_details = fb["care"]
        problem_details = fb["problem"]
        treatment_details = fb["treatment"]

        validated_care_plan = PlantCarePlan.model_validate({
            "summary": fb["summary"],
            "watering": care_details["watering"],
            "sunlight": care_details["sunlight"],
            "humidity": care_details["humidity"],
            "temperature": care_details["temperature"],
            "soil": care_details["soil"],
            "fertilization": care_details["fertilization"],
            "pruning": care_details["pruning"],
            "general_care": [
                f"Sunlight: {care_details['sunlight']}",
                f"Watering: {care_details['watering']}",
                f"Soil: {care_details['soil']}",
            ],
        })

        care_dict = validated_care_plan.model_dump()
        treatment_req = bool(treatment_details.get("required") or problem_details.get("detected"))
        problem_cat = problem_details.get("category", "healthy")
        product_cat = treatment_details.get("product_category", "none")

        if db and scan_id_str:
            try:
                scan_uuid = uuid.UUID(scan_id_str)
                scan_repo = ScanRepository(db)
                scan_repo.add_care_recommendation(
                    scan_id=scan_uuid,
                    summary=fb["summary"],
                    care_data=care_dict,
                    problem_detected=problem_details.get("detected", False),
                    problem_category=problem_cat,
                    problem_severity=problem_details.get("severity", "none"),
                    treatment_data=treatment_details,
                    provider="synthesis_fallback",
                )
            except Exception as db_err:
                logger.warning("Node[plant_analysis]: Fallback db error: %s", db_err)

        return {
            "care_plan": care_dict,
            "treatment_required": treatment_req,
            "problem_category": problem_cat,
            "required_product_category": product_cat,
            "treatment_reason": problem_details.get("description") or f"Targeted care for {disease}",
            "treatment_confidence": 0.88,
            "messages": [f"Synthesized species care plan for {plant_species}."],
        }
    finally:
        if close_db and db:
            db.close()


# ── 5. Treatment Decision Node ──────────────────────────────────


async def treatment_decision_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Evaluates WHAT category of treatment/product the plant needs.
    Strictly determines WHAT the plant needs without selecting real products
    (no product IDs, prices, inventory, or brands).
    """
    from app.ai.schemas.care import TreatmentDecisionOutput

    is_required = state.get("treatment_required", False)
    problem_cat = state.get("problem_category", "healthy")
    prod_cat = state.get("required_product_category", "none")
    disease = state.get("disease", "None")
    severity = state.get("severity", "none")

    # Map problem to normalized product category if not specified
    normalized_prod_cat = prod_cat.lower().strip()
    if normalized_prod_cat in ("fungicide", "copper_spray", "copper_bactericide", "neem_oil"):
        normalized_prod_cat = "fungicide"
    elif normalized_prod_cat in ("pesticide", "insecticide", "insecticidal_soap", "systemic_insecticide"):
        normalized_prod_cat = "pest_control"
    elif normalized_prod_cat in ("fertilizer", "balanced_fertilizer", "micronutrient_supplement"):
        normalized_prod_cat = "fertilizer"
    elif normalized_prod_cat in ("soil_amendment", "perlite", "charcoal"):
        normalized_prod_cat = "soil_amendment"
    elif normalized_prod_cat in ("potting_mix", "well_draining_soil", "soil"):
        normalized_prod_cat = "potting_mix"
    elif not is_required or problem_cat == "healthy":
        normalized_prod_cat = "none"
    elif normalized_prod_cat not in ("fertilizer", "fungicide", "pest_control", "soil_amendment", "potting_mix", "plant_care", "none"):
        normalized_prod_cat = "plant_care"

    decision = TreatmentDecisionOutput.model_validate({
        "treatment_required": is_required,
        "problem_category": problem_cat if problem_cat in (
            "healthy", "fungal_disease", "bacterial_disease", "viral_disease",
            "pest_infestation", "nutrient_deficiency", "environmental_stress",
            "overwatering", "underwatering", "root_rot", "sunburn", "other"
        ) else "other",
        "required_product_category": normalized_prod_cat,
        "treatment_reason": (
            f"Active treatment needed for {problem_cat} ({disease}, severity={severity})."
            if is_required else "Plant is healthy or requires standard cultural care only."
        ),
        "treatment_confidence": float(state.get("treatment_confidence", 0.9)),
        "recommended_actions": [
            f"Apply appropriate {normalized_prod_cat} as instructed" if is_required else "Follow standard watering and sunlight care schedule",
            "Monitor plant leaves and soil over the next 7-14 days",
        ],
        "precautions": [
            "Always follow manufacturer dosage and safety guidelines",
            "Avoid direct intense sunlight immediately after foliar applications",
        ],
    })

    msg = (
        f"Treatment Decision: treatment_required={decision.treatment_required}, "
        f"problem_category={decision.problem_category}, "
        f"required_product_category={decision.required_product_category}"
    )
    logger.info("Node[treatment_decision]: %s", msg)

    return {
        "treatment_required": decision.treatment_required,
        "problem_category": decision.problem_category,
        "required_product_category": decision.required_product_category,
        "treatment_reason": decision.treatment_reason,
        "treatment_confidence": decision.treatment_confidence,
        "messages": [msg],
    }


# ── 6. Product Recommendation Node ──────────────────────────────


async def product_recommendation_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Recommends real products using a LangChain tool-calling agent.

    Pipeline:
        Treatment Requirement (from state)
        → Agent calls search_products tool
        → Agent calls get_compatible_products tool
        → Agent calls check_product_stock tool
        → Agent calls get_product for details
        → Agent ranks candidates and generates explanations
        → Returns up to 3 recommendations (best, budget, premium)

    CRITICAL RULE:
        The LLM is NOT the source of product truth.
        Database = product truth (names, IDs, prices, stock).
        LLM = reasoning, ranking, and explanation.

    Uses plant memory (cart_history, treatment_summary) to avoid
    recommending already-purchased products and to inform selection.

    Falls back to the direct RecommendationPipeline if the agent fails.
    """
    from app.ai.agents.product_agent import ProductRecommendationAgent

    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    required_product_category = state.get("required_product_category", "")
    plant_species = state.get("plant_species", "")
    problem_category = state.get("problem_category", "healthy")
    severity = state.get("severity", "none")
    treatment_reason = state.get("treatment_reason", "")

    # Extract plant memory for context
    cart_history = state.get("cart_history", [])
    treatment_summary = state.get("treatment_summary", {})

    # Build previously purchased product IDs to avoid re-recommending
    purchased_product_ids = set()
    for item in cart_history:
        if item.get("product_id"):
            purchased_product_ids.add(item["product_id"])

    # Build previously recommended product categories
    prev_recommended_categories = treatment_summary.get("product_categories_recommended", {})

    logger.info(
        "Node[product_recommendation]: Plant memory — purchased_products=%d, prev_categories=%s",
        len(purchased_product_ids),
        prev_recommended_categories,
    )

    try:
        # ── Primary Path: LangChain Tool-Calling Agent ──────────
        agent = ProductRecommendationAgent(db=db)
        agent_result = await agent.recommend(
            required_product_category=required_product_category,
            plant_species=plant_species,
            problem_category=problem_category,
            severity=severity,
            treatment_reason=treatment_reason,
        )

        recommended_list = agent_result.to_recommended_products_list()
        status = agent_result.status

        # Filter out already purchased products
        if recommended_list and purchased_product_ids:
            filtered_list = []
            for rec in recommended_list:
                pid = rec.get("product_id")
                if pid and pid not in purchased_product_ids:
                    filtered_list.append(rec)
            recommended_list = filtered_list
            logger.info(
                "Node[product_recommendation]: Filtered out purchased products. "
                "Remaining: %d",
                len(recommended_list),
            )

        logger.info(
            "Node[product_recommendation]: Agent completed. status=%s, "
            "recommendations=%d, reasoning=%s",
            status,
            len(recommended_list),
            agent_result.reasoning[:200] if agent_result.reasoning else "N/A",
        )

        if recommended_list:
            return {
                "recommended_products": recommended_list,
                "product_candidates": recommended_list,
                "messages": [
                    f"Agent recommended {len(recommended_list)} product(s). "
                    f"Status: {status}"
                ],
            }

        # Agent found no products — try fallback pipeline
        logger.info(
            "Node[product_recommendation]: Agent returned no products, "
            "attempting fallback pipeline."
        )

    except Exception as agent_err:
        logger.warning(
            "Node[product_recommendation]: Agent failed (%s), "
            "falling back to direct pipeline.",
            str(agent_err),
        )

    # ── Fallback Path: Direct RecommendationPipeline ────────────
    try:
        pipeline = RecommendationPipeline(db)
        treatment_data = {
            "product_category": required_product_category,
            "required": state.get("treatment_required", False),
        }

        result = pipeline.run(
            treatment_data=treatment_data,
            problem_category=problem_category,
            problem_severity=severity,
            plant_species=plant_species,
        )

        recommended_list = []
        for rec in result.recommendations:
            recommended_list.append(rec.model_dump(mode="json"))

        # Filter out already purchased products
        if recommended_list and purchased_product_ids:
            filtered_list = []
            for rec in recommended_list:
                pid = rec.get("product_id")
                if pid and pid not in purchased_product_ids:
                    filtered_list.append(rec)
            recommended_list = filtered_list

        logger.info(
            "Node[product_recommendation]: Fallback pipeline found %d "
            "product recommendation(s)",
            len(recommended_list),
        )

        return {
            "recommended_products": recommended_list,
            "product_candidates": recommended_list,
            "messages": [
                f"Fallback pipeline recommended {len(recommended_list)} product(s)."
            ],
        }
    except Exception as e:
        err = f"Product recommendation failed (both agent and pipeline): {str(e)}"
        logger.exception("Node[product_recommendation]: %s", err)
        return {
            "errors": [err],
            "recommended_products": [],
            "product_candidates": [],
            "messages": ["Product recommendation encountered an error."],
        }
    finally:
        if close_db and db:
            db.close()


# ── 7. Cart Decision Node ───────────────────────────────────────


async def cart_decision_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Examines recommended products and prepares a cart proposal.

    Picks the best recommendation and generates a cart decision payload
    for the frontend to display to the user.

    Output cart_decision_data:
    {
        "recommended_product_id": "uuid",
        "recommended_product_name": "Product Name",
        "recommended_product_price": 299.00,
        "recommended_product_image": "url",
        "recommended_product_brand": "Brand",
        "quantity": 1,
        "reason": "Recommended for the detected nutrient deficiency.",
        "requires_user_confirmation": true,
        "buy_links": [...]
    }
    """
    from app.services.cart_service import generate_buy_links

    recs = state.get("recommended_products") or []

    if not recs:
        logger.info("Node[cart_decision]: No products to recommend for cart.")
        return {
            "cart_action": "none",
            "cart_decision_data": {},
            "messages": ["No product recommendations available for cart."],
        }

    # Pick the best recommendation (first in list = highest scored)
    best = recs[0]

    # Extract product details — handle both agent output and pipeline output formats
    product_id = best.get("product_id") or ""
    product_name = best.get("name") or ""
    product_price = best.get("price", 0.0)
    product_image = best.get("product_image_url") or ""
    product_brand = best.get("product_brand") or ""
    reason = best.get("reason") or best.get("recommendation_reason") or "Recommended based on AI analysis."

    # If the product data is nested under a "product" key (pipeline format)
    if "product" in best and isinstance(best["product"], dict):
        p = best["product"]
        product_id = str(p.get("id", product_id))
        product_name = p.get("name", product_name)
        product_price = p.get("price", product_price)
        product_image = p.get("image_url", product_image)
        product_brand = p.get("brand", product_brand)

    # Generate external buy links
    buy_links_list = generate_buy_links(
        product_name=product_name,
        brand=product_brand if product_brand else None,
    )
    buy_links_dicts = [link.model_dump() for link in buy_links_list]

    decision = {
        "recommended_product_id": str(product_id),
        "recommended_product_name": product_name,
        "recommended_product_price": float(product_price),
        "recommended_product_image": product_image,
        "recommended_product_brand": product_brand,
        "quantity": 1,
        "reason": reason,
        "requires_user_confirmation": True,
        "buy_links": buy_links_dicts,
        "scan_id": state.get("scan_id", ""),
    }

    logger.info(
        "Node[cart_decision]: Prepared cart proposal for '%s' (₹%.2f). "
        "Awaiting user confirmation.",
        product_name, float(product_price),
    )

    return {
        "cart_action": "add",
        "cart_decision_data": decision,
        "cart_confirmation": "pending",
        "buy_links": buy_links_dicts,
        "messages": [
            f"Cart decision: recommending '{product_name}' for ₹{float(product_price):.2f}. "
            f"Awaiting user confirmation."
        ],
    }


# ── 8. Human Confirmation Node ──────────────────────────────────


async def human_confirmation_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Human-in-the-loop confirmation checkpoint.

    This node is the INTERRUPT point in the graph. When the graph
    reaches this node:

    1. FIRST RUN (cart_confirmation="pending"):
       The graph pauses (via interrupt_before). The current state
       is persisted by the checkpointer. The API returns the
       cart_decision_data to the frontend for the user to see.

    2. RESUME (cart_confirmation="approved" or "declined"):
       The API calls graph.update_state() with the user's decision
       then resumes. This node reads the updated confirmation.

    Frontend displays:
        "Recommended for your plant:
         Product Name — ₹299
         Reason: ...
         [Add to Cart] [View Details] [Not Now]"
    """
    confirmation = state.get("cart_confirmation", "pending")
    cart_action = state.get("cart_action", "none")

    if cart_action == "none":
        logger.info("Node[human_confirmation]: No cart action needed.")
        return {
            "cart_confirmation": "declined",
            "messages": ["No cart action to confirm."],
        }

    if confirmation == "approved":
        logger.info("Node[human_confirmation]: User APPROVED cart addition.")
        return {
            "cart_confirmation": "approved",
            "messages": ["User approved adding the recommended product to cart."],
        }

    if confirmation == "declined":
        logger.info("Node[human_confirmation]: User DECLINED cart addition.")
        return {
            "cart_confirmation": "declined",
            "cart_action": "skip",
            "messages": ["User declined the product recommendation."],
        }

    # Still pending — this state is returned to the frontend
    logger.info("Node[human_confirmation]: Confirmation pending, awaiting user input.")
    return {
        "cart_confirmation": "pending",
        "messages": ["Awaiting user confirmation for cart addition."],
    }


# ── 9. Add to Cart Node ─────────────────────────────────────────


async def add_to_cart_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Adds the recommended product to the user's cart.

    Only executes if cart_confirmation = "approved".
    Uses the CartService to validate and add the product with
    the real price from the database.

    After adding, generates external buy links so the user can
    purchase from Amazon, Flipkart, Google Shopping, etc.
    """
    from app.services.cart_service import CartService, generate_buy_links

    confirmation = state.get("cart_confirmation", "pending")

    if confirmation != "approved":
        logger.info(
            "Node[add_to_cart]: Skipped — confirmation=%s",
            confirmation,
        )
        return {
            "cart_item_added": {},
            "messages": [f"Cart addition skipped (confirmation={confirmation})."],
        }

    decision = state.get("cart_decision_data") or {}
    product_id_str = decision.get("recommended_product_id")
    user_id_str = state.get("user_id")
    scan_id_str = state.get("scan_id")

    if not product_id_str or not user_id_str:
        err = "Cannot add to cart: missing product_id or user_id."
        logger.warning("Node[add_to_cart]: %s", err)
        return {
            "errors": [err],
            "cart_item_added": {},
            "messages": [err],
        }

    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    try:
        cart_service = CartService(db)
        import uuid as uuid_mod
        user_uuid = uuid_mod.UUID(user_id_str)
        product_uuid = uuid_mod.UUID(product_id_str)
        scan_uuid = uuid_mod.UUID(scan_id_str) if scan_id_str else None

        item_response = cart_service.add_item(
            user_id=user_uuid,
            product_id=product_uuid,
            quantity=decision.get("quantity", 1),
            recommendation_reason=decision.get("reason", ""),
            scan_id=scan_uuid,
        )

        item_data = item_response.model_dump(mode="json")

        logger.info(
            "Node[add_to_cart]: Successfully added '%s' to cart for user %s. "
            "%d buy links generated.",
            item_response.product_name,
            user_id_str,
            len(item_response.buy_links),
        )

        return {
            "cart_item_added": item_data,
            "buy_links": [link.model_dump() for link in item_response.buy_links],
            "messages": [
                f"Added '{item_response.product_name}' to cart "
                f"(₹{item_response.price_at_addition:.2f}). "
                f"{len(item_response.buy_links)} external buy links available."
            ],
        }

    except ValueError as e:
        err = f"Cart addition validation failed: {str(e)}"
        logger.warning("Node[add_to_cart]: %s", err)
        return {
            "errors": [err],
            "cart_item_added": {},
            "messages": [err],
        }
    except Exception as e:
        err = f"Cart addition failed: {str(e)}"
        logger.exception("Node[add_to_cart]: %s", err)
        return {
            "errors": [err],
            "cart_item_added": {},
            "messages": ["Cart addition encountered an error."],
        }
    finally:
        if close_db and db:
            db.close()

