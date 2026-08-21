"""
Product service: business logic for product catalog and AI-powered recommendations.
"""

import uuid
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.product import Category, Product
from app.repositories.product_repository import ProductRepository
from app.repositories.scan_repository import ScanRepository
from app.repositories.plant_repository import PlantRepository
from app.ai.services.recommendation_pipeline import RecommendationPipeline
from app.schemas.product import RecommendationResult, TreatmentContext

logger = logging.getLogger(__name__)


class ProductService:
    """Business logic for product catalog and recommendations."""

    def __init__(self, db: Session):
        self.db = db
        self.product_repo = ProductRepository(db)
        self.scan_repo = ScanRepository(db)
        self.plant_repo = PlantRepository(db)

    # ── Catalog ──────────────────────────────────────────────────

    def list_categories(self) -> list[Category]:
        """Get all product categories."""
        return self.product_repo.list_categories()

    def list_products(
        self,
        category_id: Optional[uuid.UUID] = None,
    ) -> list[Product]:
        """Get products, optionally filtered by category."""
        return self.product_repo.list_products(
            category_id=category_id,
            active_only=True,
        )

    def get_product(self, product_id: uuid.UUID) -> Product:
        """Get a single product by ID."""
        product = self.product_repo.get_product_by_id(product_id)
        if not product:
            raise ValueError("Product not found")
        return product

    # ── Recommendations ──────────────────────────────────────────

    def recommend_for_scan(
        self,
        scan_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> RecommendationResult:
        """
        Run the product recommendation pipeline for a scan.

        Pipeline:
            1. Authenticate user (done by router)
            2. Load scan + verify ownership
            3. Load CareRecommendation (treatment requirement)
            4. Run RecommendationPipeline with real products from DB
            5. Return recommendations (or empty + message)

        Args:
            scan_id: ID of a scan with a CareRecommendation.
            user_id: Authenticated user's ID.

        Returns:
            RecommendationResult with best_match, budget, premium.

        Raises:
            ValueError: Scan not found, not owned, or no recommendation.
        """
        # 1. Load scan + verify ownership
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        # 2. Load care recommendation or auto-resolve from health analyses
        recommendation = self.scan_repo.get_care_recommendation(scan_id)

        # Get plant species for compatibility filtering
        plant_species = None
        if scan.identification_result:
            plant_species = (
                scan.identification_result.common_name
                or scan.identification_result.scientific_name
            )
        if not plant_species:
            plant_species = plant.name

        treatment_data = {}
        problem_category = "healthy"
        problem_severity = "low"

        if recommendation:
            treatment_data = recommendation.treatment_data or {}
            problem_category = recommendation.problem_category or "healthy"
            problem_severity = recommendation.problem_severity or "low"
            if not treatment_data.get("required", False) and not recommendation.problem_detected:
                treatment_data = {"product_category": "fertilizer", "required": True}
                problem_category = "healthy"
        else:
            # Derive context from health analyses or plant species
            health_record = None
            if scan.health_analyses:
                health_record = scan.health_analyses[0]

            if health_record and health_record.health_status in ("diseased", "warning"):
                issue_lower = (health_record.issue or "").lower()
                if any(k in issue_lower for k in ("mildew", "spot", "blight", "fung", "rot", "rust", "mold", "canker", "botrytis")):
                    treatment_data = {"product_category": "fungicide", "required": True}
                    problem_category = "fungal_disease"
                elif any(k in issue_lower for k in ("mite", "aphid", "pest", "bug", "insect", "thrip", "worm", "fly", "caterpillar")):
                    treatment_data = {"product_category": "pest_control", "required": True}
                    problem_category = "pest_infestation"
                elif any(k in issue_lower for k in ("yellow", "chlorosis", "deficien", "nutrient", "fertil", "pale")):
                    treatment_data = {"product_category": "fertilizer", "required": True}
                    problem_category = "nutrient_deficiency"
                elif any(k in issue_lower for k in ("soil", "drain", "water", "perlite")):
                    treatment_data = {"product_category": "soil_amendment", "required": True}
                    problem_category = "environmental_stress"
                else:
                    treatment_data = {"product_category": "fungicide", "required": True}
                    problem_category = "fungal_disease"
                problem_severity = health_record.severity or "medium"
            else:
                species_lower = (plant_species or "").lower()
                if "rose" in species_lower:
                    treatment_data = {"product_category": "fungicide", "required": True}
                    problem_category = "fungal_disease"
                    problem_severity = "medium"
                else:
                    treatment_data = {"product_category": "fertilizer", "required": True}
                    problem_category = "healthy"
                    problem_severity = "low"

        # 3. Run the recommendation pipeline
        pipeline = RecommendationPipeline(self.db)
        result = pipeline.run(
            treatment_data=treatment_data,
            problem_category=problem_category,
            problem_severity=problem_severity,
            plant_species=plant_species,
        )

        logger.info(
            "Product recommendations for scan %s: %d results (problem=%s, category=%s)",
            scan_id,
            len(result.recommendations),
            problem_category,
            treatment_data.get("product_category"),
        )

        return result
