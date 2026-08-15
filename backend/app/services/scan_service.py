"""
Scan service: manages scan creation, image validation, status tracking,
and AI-powered plant identification + health/disease analysis + care recommendations.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.plant_scan import PlantScan, ScanStatus
from app.repositories.scan_repository import ScanRepository
from app.repositories.plant_repository import PlantRepository
from app.services.image_storage_service import get_image_storage
from app.ai.services.plant_identification_service import PlantIdentificationService
from app.ai.services.health_analysis_service import HealthAnalysisService
from app.ai.services.ai_analysis_service import AIAnalysisService, AIAnalysisError
from app.ai.providers.plantnet_provider import PlantNetError
from app.ai.providers.groq_health_provider import GroqHealthError

logger = logging.getLogger(__name__)


class ScanService:
    """Business logic for plant scan management."""

    def __init__(self, db: Session):
        self.db = db
        self.scan_repo = ScanRepository(db)
        self.plant_repo = PlantRepository(db)
        self.image_storage = get_image_storage()

    def create_scan(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        image: UploadFile,
    ) -> PlantScan:
        """
        Create a new scan for a plant:
        1. Verify plant ownership
        2. Validate the uploaded image
        3. Save the image to storage
        4. Create a PlantScan record with PENDING status
        5. Return the scan

        Future: Step 4.5 would queue an AI job via Celery/Redis.
        """
        # 1. Verify plant ownership
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        # 2. Validate the image (done inside storage service)
        # 3. Save the image
        image_url = self.image_storage.save(image, subfolder=f"scans/{plant_id}")

        # 4. Create the scan record
        scan = self.scan_repo.create(
            plant_id=plant_id,
            image_url=image_url,
            status=ScanStatus.PENDING,
        )

        # Also add the image to the plant's image gallery
        self.plant_repo.add_image(
            plant_id=plant_id,
            image_url=image_url,
            image_type="scan",
        )

        # Future: Queue AI job here
        # Example:
        # from app.ai.tasks import process_scan
        # process_scan.delay(str(scan.id))

        return scan

    async def identify_plant(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        image: UploadFile,
    ) -> dict:
        """
        Full plant identification + health analysis pipeline:
        1. Authenticate user (done by router via dependency)
        2. Verify plant ownership
        3. Validate uploaded image
        4. Save image to storage
        5. Create/update scan record (PROCESSING)
        6. Call Pl@ntNet via PlantIdentificationService
        7. Store identification result in IdentificationResult table
        7.5. Call Groq vision for health/disease analysis
        7.6. Store health analysis in HealthAnalysis table
        8. Update Plant record with best-match data
        9. Mark scan as COMPLETED (or FAILED on error)
        10. Return structured identification + health response

        Returns:
            Dict with scan_id, plant identification, and alternatives.

        Raises:
            ValueError: Plant not found / not owned by user.
            PlantNetError: Pl@ntNet API failures (propagated to router).
        """
        # 2. Verify plant ownership, or auto-create if new plant ID
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            plant = self.plant_repo.create(
                plant_id=plant_id,
                user_id=user_id,
                name="Unidentified Plant",
            )

        # 3-4. Validate and save image
        image_url = self.image_storage.save(image, subfolder=f"scans/{plant_id}")

        # 5. Create scan record in PROCESSING state
        scan = self.scan_repo.create(
            plant_id=plant_id,
            image_url=image_url,
            status=ScanStatus.PROCESSING,
        )

        # Also add to plant's image gallery
        self.plant_repo.add_image(
            plant_id=plant_id,
            image_url=image_url,
            image_type="scan",
        )

        try:
            # 6. Execute LangGraph Pipeline (Image Validation -> Pl@ntNet -> DB Persistence -> Health Diagnosis or Request Better Image)
            from app.ai.graph.runner import run_pipeline

            disk_path = image_url.lstrip("/")

            graph_state = await run_pipeline(
                user_id=str(user_id),
                plant_id=str(plant.id),
                scan_id=str(scan.id),
                image_urls=[disk_path],
                db=self.db,
            )

            # Check if critical errors occurred during validation
            if not graph_state.get("image_quality_passed", True) and not graph_state.get("plant_species"):
                errors = graph_state.get("errors", [])
                err_msg = errors[0] if errors else "Image validation failed."
                self.scan_repo.update_status(scan, ScanStatus.FAILED)
                raise ValueError(err_msg)

            plant_data = {
                "name": graph_state.get("plant_species") or plant.name,
                "scientificName": graph_state.get("scientific_name", ""),
                "confidence": graph_state.get("identification_confidence", 0.0),
            }

            health_data = None
            if graph_state.get("health_status") and graph_state.get("health_status") != "unknown":
                health_data = {
                    "healthStatus": graph_state.get("health_status"),
                    "issue": graph_state.get("disease", ""),
                    "confidence": graph_state.get("disease_confidence", 0.0),
                    "severity": graph_state.get("severity", "none"),
                    "symptoms": graph_state.get("symptoms", []),
                    "possibleCauses": graph_state.get("possible_causes", []),
                }

            # 7. Mark scan as COMPLETED
            self.scan_repo.update_status(
                scan,
                ScanStatus.COMPLETED,
                completed_at=datetime.now(timezone.utc),
            )

            # 8. Return structured response
            return {
                "scan_id": str(scan.id),
                "plant": plant_data,
                "alternatives": graph_state.get("alternative_species", []),
                "lowConfidence": graph_state.get("low_confidence", False),
                "requiresBetterImage": graph_state.get("requires_better_image", False),
                "healthAnalysis": health_data,
                "messages": graph_state.get("messages", []),
            }

        except PlantNetError:
            self.scan_repo.update_status(scan, ScanStatus.FAILED)
            raise

        except ValueError:
            self.scan_repo.update_status(scan, ScanStatus.FAILED)
            raise

        except Exception as e:
            logger.exception("Unexpected error during plant identification")
            self.scan_repo.update_status(scan, ScanStatus.FAILED)
            raise PlantNetError(
                f"Plant identification failed: {str(e)}", status_code=500
            )

    def get_scan(self, scan_id: uuid.UUID, user_id: uuid.UUID) -> PlantScan:
        """
        Get a scan by ID, verifying that the user owns the associated plant.
        """
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        # Verify ownership through the plant relationship
        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        return scan

    def get_scans_for_plant(
        self, plant_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[PlantScan]:
        """
        Get all scans for a plant, verifying ownership.
        """
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        return self.scan_repo.get_scans_for_plant(plant_id)

    async def analyze_health(
        self,
        scan_id: uuid.UUID,
        user_id: uuid.UUID,
        plant_name: Optional[str] = None,
        scientific_name: Optional[str] = None,
        image_url: Optional[str] = None,
    ) -> dict:
        """
        Run health/disease analysis on an existing scan or arbitrary image.

        Used by the 'Diagnose Health' button on the plant details page.
        Sends the image to Groq vision and stores the result against the scan.

        Args:
            scan_id: ID of the scan to analyze.
            user_id: Authenticated user's ID.
            plant_name: Common name of the plant (for context).
            scientific_name: Scientific name (for context).
            image_url: Image URL/path to analyze. If not provided, uses scan's image.

        Returns:
            Structured health analysis result dict.
        """
        # Verify scan ownership
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        # Resolve image path
        img_path = image_url or scan.image_url
        disk_path = img_path.lstrip("/")

        # Species context for better analysis
        species = plant_name or scientific_name or plant.name or None

        try:
            from app.ai.graph.nodes import health_analysis_node
            from app.ai.graph.state import create_initial_state

            initial_state = create_initial_state(
                user_id=str(user_id),
                plant_id=str(plant.id),
                scan_id=str(scan.id),
                image_urls=[disk_path],
            )
            initial_state["plant_species"] = species or plant.name or ""
            initial_state["scientific_name"] = scientific_name or ""

            node_result = await health_analysis_node(
                state=initial_state,
                config={"configurable": {"db": self.db}},
            )

            status = node_result.get("health_status", "unknown")
            issue = node_result.get("disease", "No issues detected")
            confidence = float(node_result.get("disease_confidence", 0.0))
            severity = node_result.get("severity", "none")
            symptoms = node_result.get("symptoms", [])
            possible_causes = node_result.get("possible_causes", [])
            is_low_confidence = bool(node_result.get("low_confidence", False))

            return {
                "healthStatus": status,
                "issue": issue,
                "confidence": confidence,
                "severity": severity,
                "symptoms": symptoms,
                "possibleCauses": possible_causes,
                "lowConfidence": is_low_confidence,
            }

        except GroqHealthError:
            raise
        except Exception as e:
            logger.exception("Health analysis failed for scan %s", scan_id)
            raise GroqHealthError(
                f"Health analysis failed: {str(e)}", status_code=502
            )

    # ── AI Care & Treatment Analysis ─────────────────────────────

    async def run_analysis(
        self,
        scan_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> dict:
        """
        Run the full AI care & treatment analysis pipeline on a completed scan.

        Pipeline:
            1. Verify scan ownership and COMPLETED status
            2. Gather context: identification, health analyses, scan history
            3. Call AIAnalysisService (knowledge + LLM + validation)
            4. Persist validated result to CareRecommendation table
            5. Return the structured recommendation

        If a recommendation already exists for this scan (re-analysis),
        it is overwritten with the new result.

        Args:
            scan_id: ID of a COMPLETED scan with identification data.
            user_id: Authenticated user's ID.

        Returns:
            Dict with the full analysis result (summary, care, problem, treatment).

        Raises:
            ValueError: Scan not found, not owned, or not completed.
            AIAnalysisError: AI pipeline failures.
        """
        # 1. Verify scan ownership and status
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        if scan.status != ScanStatus.COMPLETED:
            raise ValueError(
                f"Scan must be COMPLETED before analysis. Current status: {scan.status.value}"
            )

        # Require identification data
        if not scan.identification_result:
            raise ValueError(
                "Scan must have identification data before analysis. "
                "Run plant identification first."
            )

        # 2. Gather context
        identification = scan.identification_result
        plant_data = {
            "name": identification.common_name or plant.name,
            "scientific_name": identification.scientific_name or "",
            "family": identification.family or "",
            "genus": identification.genus or "",
        }

        # Gather latest health analysis if available
        health_data = None
        if scan.health_analyses:
            latest_health = sorted(
                scan.health_analyses, key=lambda h: h.created_at, reverse=True
            )[0]
            health_data = {
                "health_status": latest_health.health_status,
                "issue": latest_health.issue,
                "confidence": latest_health.confidence,
                "severity": latest_health.severity,
                "symptoms": latest_health.symptoms or [],
                "possible_causes": latest_health.possible_causes or [],
            }

        # Gather scan history for the plant (last 5 scans)
        scan_history = []
        all_scans = self.scan_repo.get_scans_for_plant(scan.plant_id)
        for prev_scan in all_scans[:5]:
            if prev_scan.id == scan_id:
                continue  # Skip the current scan
            if prev_scan.health_analyses:
                latest_h = sorted(
                    prev_scan.health_analyses,
                    key=lambda h: h.created_at,
                    reverse=True,
                )[0]
                scan_history.append({
                    "date": prev_scan.created_at.strftime("%Y-%m-%d"),
                    "health_status": latest_h.health_status or "unknown",
                    "issue": latest_h.issue or "N/A",
                })

        # 3. Call AI analysis service
        ai_service = AIAnalysisService()
        analysis_result = await ai_service.analyze(
            plant_data=plant_data,
            health_data=health_data,
            scan_history=scan_history or None,
        )

        # 4. Persist validated result
        problem = analysis_result.get("problem", {})
        treatment = analysis_result.get("treatment", {})
        care = analysis_result.get("care", {})

        recommendation = self.scan_repo.add_care_recommendation(
            scan_id=scan_id,
            summary=analysis_result.get("summary"),
            care_data=care,
            problem_detected=problem.get("detected", False),
            problem_category=problem.get("category"),
            problem_severity=problem.get("severity"),
            treatment_data=treatment,
            raw_llm_response=analysis_result.get("_raw_llm_response"),
            provider="groq",
        )

        logger.info(
            "Care recommendation persisted for scan %s (problem=%s, category=%s)",
            scan_id,
            problem.get("detected", False),
            problem.get("category", "healthy"),
        )

        # 5. Return structured response
        return {
            "id": str(recommendation.id),
            "scan_id": str(recommendation.scan_id),
            "summary": recommendation.summary,
            "care": care,
            "problem": {
                "detected": recommendation.problem_detected,
                "name": problem.get("name", ""),
                "category": recommendation.problem_category or "healthy",
                "severity": recommendation.problem_severity or "none",
                "description": problem.get("description", ""),
            },
            "treatment": treatment,
            "provider": recommendation.provider,
            "created_at": recommendation.created_at.isoformat(),
        }

    def get_recommendation(
        self,
        scan_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> dict:
        """
        Fetch a previously generated care recommendation for a scan.

        Args:
            scan_id: ID of the scan.
            user_id: Authenticated user's ID.

        Returns:
            Dict with the full recommendation data.

        Raises:
            ValueError: Scan not found, not owned, or no recommendation exists.
        """
        # Verify scan ownership
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        # Fetch recommendation
        recommendation = self.scan_repo.get_care_recommendation(scan_id)
        if not recommendation:
            raise ValueError("No recommendation found for this scan. Run analysis first.")

        # Build response from persisted data
        care_data = recommendation.care_data or {}
        treatment_data = recommendation.treatment_data or {}

        return {
            "id": str(recommendation.id),
            "scan_id": str(recommendation.scan_id),
            "summary": recommendation.summary or "",
            "care": care_data,
            "problem": {
                "detected": recommendation.problem_detected,
                "name": care_data.get("problem", {}).get("name", "")
                if isinstance(care_data.get("problem"), dict) else "",
                "category": recommendation.problem_category or "healthy",
                "severity": recommendation.problem_severity or "none",
                "description": care_data.get("problem", {}).get("description", "")
                if isinstance(care_data.get("problem"), dict) else "",
            },
            "treatment": treatment_data,
            "provider": recommendation.provider,
            "created_at": recommendation.created_at.isoformat(),
        }


