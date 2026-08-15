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

        # 2. Load care recommendation (treatment requirement)
        recommendation = self.scan_repo.get_care_recommendation(scan_id)
        if not recommendation:
            raise ValueError(
                "No AI analysis found for this scan. "
                "Run POST /api/scans/{scan_id}/analyze first."
            )

        # 3. Extract treatment context
        treatment_data = recommendation.treatment_data or {}
        problem_category = recommendation.problem_category
        problem_severity = recommendation.problem_severity

        # Get plant species for compatibility filtering
        plant_species = None
        if scan.identification_result:
            plant_species = (
                scan.identification_result.common_name
                or scan.identification_result.scientific_name
            )
        if not plant_species:
            plant_species = plant.name

        # Check if treatment is required
        treatment_required = treatment_data.get("required", False)
        if not treatment_required and not recommendation.problem_detected:
            # Plant is healthy — still recommend general care products
            logger.info(
                "Scan %s: plant is healthy, recommending general care products",
                scan_id,
            )
            treatment_data = {"product_category": "balanced_fertilizer"}
            problem_category = "healthy"

        # 4. Run the recommendation pipeline
        pipeline = RecommendationPipeline(self.db)
        result = pipeline.run(
            treatment_data=treatment_data,
            problem_category=problem_category,
            problem_severity=problem_severity,
            plant_species=plant_species,
        )

        logger.info(
            "Product recommendations for scan %s: %d results (problem=%s)",
            scan_id,
            len(result.recommendations),
            problem_category,
        )

        return result
