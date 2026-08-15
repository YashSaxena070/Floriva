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
        err = f"Health analysis failed: {str(e)}"
        logger.exception("Node[health_analysis]: %s", err)
        return {
            "errors": [err],
            "health_status": "unknown",
            "disease": "Diagnosis unavailable",
            "low_confidence": True,
            "requires_better_image": True,
            "messages": ["Health analysis encountered an error."],
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
    2. Validates LLM output with PlantCarePlan and AIAnalysisResponse schemas.
    3. Persists result to CareRecommendation database table.
    4. Updates LangGraph state.
    """
    from app.ai.schemas.care import PlantCarePlan, AIAnalysisResponse
    from app.ai.services.knowledge_service import PlantKnowledgeRetriever

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

    # Retrieve scan history if plant_id & DB session are available
    scan_history = []
    scan_id_str = state.get("scan_id")
    plant_id_str = state.get("plant_id")

    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    elif scan_id_str or plant_id_str:
        db = SessionLocal()
        close_db = True

    try:
        if db and plant_id_str:
            try:
                scan_repo = ScanRepository(db)
                history_scans = scan_repo.list_by_plant_id(uuid.UUID(plant_id_str))
                for prev_scan in history_scans[:5]:
                    if scan_id_str and str(prev_scan.id) == scan_id_str:
                        continue
                    if prev_scan.health_analyses:
                        latest_ha = prev_scan.health_analyses[-1]
                        scan_history.append({
                            "scan_date": str(prev_scan.created_at),
                            "health_status": latest_ha.health_status,
                            "issue": latest_ha.issue,
                        })
            except Exception as hist_err:
                logger.warning("Node[plant_analysis]: History lookup error: %s", hist_err)

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
            scan_history=scan_history if scan_history else None,
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
                    problem_name=problem_details.name,
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
        err = f"Plant care analysis failed: {str(e)}"
        logger.exception("Node[plant_analysis]: %s", err)
        return {
            "errors": [err],
            "treatment_required": False,
            "problem_category": "healthy",
            "required_product_category": "none",
            "messages": ["Plant care analysis encountered an error."],
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
    Queries real database products and runs the 7-step compatibility and ranking pipeline.
    """
    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    try:
        pipeline = RecommendationPipeline(db)
        treatment_data = {
            "product_category": state.get("required_product_category", ""),
            "required": state.get("treatment_required", False),
        }

        result = pipeline.run(
            treatment_data=treatment_data,
            problem_category=state.get("problem_category", "healthy"),
            problem_severity=state.get("severity", "none"),
            plant_species=state.get("plant_species", ""),
        )

        recommended_list = []
        for rec in result.recommendations:
            recommended_list.append(rec.model_dump(mode="json"))

        logger.info(
            "Node[product_recommendation]: Found %d product recommendation(s)",
            len(recommended_list),
        )

        return {
            "recommended_products": recommended_list,
            "product_candidates": recommended_list,
            "messages": [f"Recommended {len(recommended_list)} product(s)."],
        }
    except Exception as e:
        err = f"Product recommendation failed: {str(e)}"
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
    Evaluates cart action. In this stage, products are suggested only (no cart yet).
    """
    recs = state.get("recommended_products") or []
    if recs:
        action = "suggested"
        msg = f"Suggested {len(recs)} product(s) to user for treatment."
    else:
        action = "none"
        msg = "No product recommendations to add or suggest."

    logger.info("Node[cart_decision]: cart_action=%s", action)
    return {
        "cart_action": action,
        "messages": [msg],
    }


# ── 8. Human Confirmation Node ──────────────────────────────────


async def human_confirmation_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Human-in-the-loop confirmation point for cart or treatment approvals.
    Pass-through in automated execution.
    """
    logger.info("Node[human_confirmation]: Confirmation passed.")
    return {
        "messages": ["Human confirmation step passed."],
    }


# ── 9. Add to Cart Node ─────────────────────────────────────────


async def add_to_cart_node(
    state: PlantifyGraphState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Placeholder/stub node for future shopping cart addition.
    """
    logger.info("Node[add_to_cart]: Cart action completed (stub).")
    return {
        "messages": ["Cart addition step completed."],
    }
