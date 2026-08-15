"""
Product Recommendation Pipeline — a dedicated, sequential, step-based pipeline.

Inspired by LangChain's chain pattern. Each step is a standalone class with
a run() method. The pipeline chains them sequentially, passing a PipelineContext
through each step.

CRITICAL RULE: The LLM NEVER invents products. This pipeline only queries
real products from the database. The AI determines WHAT TYPE of product
is needed; this pipeline determines WHICH REAL PRODUCT to recommend.

Pipeline steps:
    Step 1: CategoryResolver  — Maps AI treatment → product category slugs
    Step 2: ProductQuery       — Queries products from DB by category
    Step 3: CompatibilityFilter — Filters by species + problem compatibility
    Step 4: AvailabilityFilter — Removes out-of-stock / inactive products
    Step 5: PriceRanker        — Sorts and tags budget/mid/premium tiers
    Step 6: RelevanceScorer    — Scores products by match quality
    Step 7: ResultBuilder      — Picks best/budget/premium + generates reasons

Usage:
    pipeline = RecommendationPipeline(db)
    result = pipeline.run(
        treatment_data=care_recommendation.treatment_data,
        problem_category="fungal_disease",
        problem_severity="medium",
        plant_species="Snake Plant",
    )
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.product_repository import ProductRepository
from app.schemas.product import (
    ProductResponse,
    RecommendedProduct,
    TreatmentContext,
    RecommendationResult,
)

logger = logging.getLogger(__name__)


# ── Pipeline Context ────────────────────────────────────────────
#
# Flows through all steps. Each step reads from and writes to this.


@dataclass
class ScoredProduct:
    """A product with its computed relevance score and price tier."""
    product: Product
    relevance_score: float = 0.0
    price_tier: str = "mid"  # "budget", "mid", "premium"
    compatibility_count: int = 0
    problem_match: bool = False
    species_match: bool = False


@dataclass
class PipelineContext:
    """
    Shared state that flows through all pipeline steps.

    Each step reads what it needs and writes its output.
    The final step builds the PipelineResult from accumulated data.
    """
    # ── Inputs (set at pipeline start) ──────────────────────────
    treatment_data: dict = field(default_factory=dict)
    problem_category: str | None = None
    problem_severity: str | None = None
    plant_species: str | None = None

    # ── Step outputs (accumulated by steps) ─────────────────────
    resolved_category_slugs: list[str] = field(default_factory=list)
    candidate_products: list[Product] = field(default_factory=list)
    compatible_products: list[Product] = field(default_factory=list)
    available_products: list[Product] = field(default_factory=list)
    scored_products: list[ScoredProduct] = field(default_factory=list)

    # ── Final result (set by ResultBuilder) ─────────────────────
    result: RecommendationResult | None = None

    # ── Pipeline metadata ───────────────────────────────────────
    steps_executed: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


# ── Abstract Step ───────────────────────────────────────────────


class PipelineStep(ABC):
    """
    Base class for all pipeline steps.

    Each step has a name and a run() method that takes a PipelineContext,
    performs its work, and returns the (possibly modified) context.
    """
    name: str = "unnamed_step"

    @abstractmethod
    def run(self, context: PipelineContext) -> PipelineContext:
        """Execute this step. Must return the context."""
        ...


# ── Step 1: CategoryResolver ────────────────────────────────────


# Maps AI treatment product_category → database category slugs
TREATMENT_TO_CATEGORY_MAP: dict[str, list[str]] = {
    # Direct mappings
    "fungicide": ["fungicide"],
    "pesticide": ["pest_control"],
    "insecticide": ["pest_control"],
    "insecticidal_soap": ["pest_control"],
    "neem_oil": ["pest_control", "fungicide"],
    "copper_spray": ["fungicide"],
    "copper_bactericide": ["fungicide"],
    "hydrogen_peroxide": ["plant_care"],
    "systemic_insecticide": ["pest_control"],
    "balanced_fertilizer": ["fertilizer"],
    "micronutrient_supplement": ["fertilizer"],
    "soil_amendment": ["soil_amendment"],
    "well_draining_soil": ["soil", "soil_amendment"],

    # Problem-category-based fallback mappings
    "fungal_disease": ["fungicide", "plant_care"],
    "bacterial_disease": ["fungicide", "plant_care"],
    "pest_infestation": ["pest_control"],
    "nutrient_deficiency": ["fertilizer", "soil_amendment"],
    "overwatering": ["soil", "soil_amendment"],
    "underwatering": ["plant_care"],
    "root_rot": ["soil", "fungicide", "plant_care"],
    "environmental_stress": ["plant_care"],
    "sunburn": ["plant_care"],

    # Generic fallback
    "none": [],
    "": [],
}


class CategoryResolver(PipelineStep):
    """
    Step 1: Maps the AI's treatment product_category → database category slugs.

    Reads: treatment_data.product_category, problem_category
    Writes: resolved_category_slugs
    """
    name = "category_resolver"

    def run(self, context: PipelineContext) -> PipelineContext:
        treatment = context.treatment_data or {}
        product_cat = treatment.get("product_category", "").lower().strip()
        problem_cat = context.problem_category or ""

        slugs: set[str] = set()

        # Try product_category from AI treatment
        if product_cat and product_cat in TREATMENT_TO_CATEGORY_MAP:
            slugs.update(TREATMENT_TO_CATEGORY_MAP[product_cat])

        # Fallback: try problem_category
        if not slugs and problem_cat:
            problem_key = problem_cat.lower().strip()
            if problem_key in TREATMENT_TO_CATEGORY_MAP:
                slugs.update(TREATMENT_TO_CATEGORY_MAP[problem_key])

        # If still nothing, use broad categories
        if not slugs:
            slugs.update(["plant_care", "fertilizer"])

        context.resolved_category_slugs = list(slugs)
        context.steps_executed.append(self.name)

        logger.info(
            "Pipeline[%s]: product_cat=%s, problem_cat=%s → slugs=%s",
            self.name, product_cat, problem_cat, context.resolved_category_slugs,
        )
        return context


# ── Step 2: ProductQuery ────────────────────────────────────────


class ProductQuery(PipelineStep):
    """
    Step 2: Queries products from the database matching resolved categories.

    Reads: resolved_category_slugs
    Writes: candidate_products
    """
    name = "product_query"

    def __init__(self, product_repo: ProductRepository):
        self.product_repo = product_repo

    def run(self, context: PipelineContext) -> PipelineContext:
        if not context.resolved_category_slugs:
            context.candidate_products = []
            context.steps_executed.append(self.name)
            return context

        products = self.product_repo.get_products_by_category_slugs(
            category_slugs=context.resolved_category_slugs,
            active_only=True,
        )
        context.candidate_products = products
        context.steps_executed.append(self.name)

        logger.info(
            "Pipeline[%s]: queried %d products for categories %s",
            self.name, len(products), context.resolved_category_slugs,
        )
        return context


# ── Step 3: CompatibilityFilter ─────────────────────────────────


class CompatibilityFilter(PipelineStep):
    """
    Step 3: Filters products by compatibility with the problem category
    and optionally the plant species.

    A product passes if:
    - It has NO compatibility entries (universally compatible), OR
    - It has a compatibility entry matching the problem category
      with species=NULL or species matching the plant.

    Reads: candidate_products, problem_category, plant_species
    Writes: compatible_products
    """
    name = "compatibility_filter"

    def run(self, context: PipelineContext) -> PipelineContext:
        problem = context.problem_category
        species = context.plant_species

        compatible = []
        for product in context.candidate_products:
            if not product.compatibilities:
                # No compatibility restrictions — universally compatible
                compatible.append(product)
                continue

            for compat in product.compatibilities:
                if compat.problem_category == problem:
                    # Problem matches — check species
                    if compat.plant_species is None:
                        compatible.append(product)
                        break
                    elif species and species.lower() in compat.plant_species.lower():
                        compatible.append(product)
                        break

        # If strict filtering removed everything, fall back to all candidates
        if not compatible and context.candidate_products:
            logger.info(
                "Pipeline[%s]: strict filter removed all products, "
                "falling back to all %d candidates",
                self.name, len(context.candidate_products),
            )
            compatible = context.candidate_products

        context.compatible_products = compatible
        context.steps_executed.append(self.name)

        logger.info(
            "Pipeline[%s]: %d → %d products (problem=%s, species=%s)",
            self.name, len(context.candidate_products),
            len(compatible), problem, species,
        )
        return context


# ── Step 4: AvailabilityFilter ──────────────────────────────────


class AvailabilityFilter(PipelineStep):
    """
    Step 4: Removes products that are out of stock or inactive.

    Reads: compatible_products
    Writes: available_products
    """
    name = "availability_filter"

    def run(self, context: PipelineContext) -> PipelineContext:
        available = [
            p for p in context.compatible_products
            if p.active and p.stock > 0
        ]
        context.available_products = available
        context.steps_executed.append(self.name)

        removed = len(context.compatible_products) - len(available)
        if removed:
            logger.info(
                "Pipeline[%s]: removed %d out-of-stock/inactive products",
                self.name, removed,
            )
        return context


# ── Step 5: PriceRanker ─────────────────────────────────────────


class PriceRanker(PipelineStep):
    """
    Step 5: Sorts products by price and assigns price tier tags.

    Tiers are computed relative to the price range of available products:
    - Bottom 33%: budget
    - Middle 34%: mid
    - Top 33%: premium

    Reads: available_products
    Writes: scored_products (initial, scores set to 0)
    """
    name = "price_ranker"

    def run(self, context: PipelineContext) -> PipelineContext:
        products = context.available_products
        if not products:
            context.scored_products = []
            context.steps_executed.append(self.name)
            return context

        # Sort by price
        sorted_products = sorted(products, key=lambda p: float(p.price))

        # Compute price tier boundaries
        prices = [float(p.price) for p in sorted_products]
        min_price = min(prices)
        max_price = max(prices)
        price_range = max_price - min_price

        scored = []
        for product in sorted_products:
            price = float(product.price)

            if price_range == 0:
                tier = "mid"
            else:
                relative = (price - min_price) / price_range
                if relative <= 0.33:
                    tier = "budget"
                elif relative <= 0.66:
                    tier = "mid"
                else:
                    tier = "premium"

            scored.append(ScoredProduct(
                product=product,
                price_tier=tier,
            ))

        context.scored_products = scored
        context.steps_executed.append(self.name)
        return context


# ── Step 6: RelevanceScorer ─────────────────────────────────────


class RelevanceScorer(PipelineStep):
    """
    Step 6: Scores each product by relevance to the treatment requirement.

    Scoring factors:
    - Compatibility match count (0.0 - 0.4)
    - Problem category direct match (0.0 - 0.3)
    - Species-specific match bonus (0.0 - 0.15)
    - Stock availability depth (0.0 - 0.1)
    - Has usage instructions (0.0 - 0.05)

    Reads: scored_products, problem_category, plant_species
    Writes: scored_products (updates relevance_score)
    """
    name = "relevance_scorer"

    def run(self, context: PipelineContext) -> PipelineContext:
        problem = context.problem_category
        species = context.plant_species

        for scored in context.scored_products:
            product = scored.product
            score = 0.0

            # Factor 1: Compatibility entries count (max 0.4)
            compat_count = len(product.compatibilities) if product.compatibilities else 0
            scored.compatibility_count = compat_count
            score += min(compat_count * 0.1, 0.4)

            # Factor 2: Direct problem category match (max 0.3)
            if problem and product.compatibilities:
                for compat in product.compatibilities:
                    if compat.problem_category == problem:
                        scored.problem_match = True
                        score += 0.3
                        break

            # Factor 3: Species-specific match bonus (max 0.15)
            if species and product.compatibilities:
                for compat in product.compatibilities:
                    if (compat.plant_species and
                            species.lower() in compat.plant_species.lower()):
                        scored.species_match = True
                        score += 0.15
                        break

            # Factor 4: Stock depth (max 0.1)
            if product.stock >= 50:
                score += 0.1
            elif product.stock >= 20:
                score += 0.07
            elif product.stock >= 5:
                score += 0.04

            # Factor 5: Has usage instructions (0.05)
            if product.usage_instructions:
                score += 0.05

            scored.relevance_score = round(min(score, 1.0), 4)

        # Sort by score descending
        context.scored_products.sort(
            key=lambda s: s.relevance_score, reverse=True
        )
        context.steps_executed.append(self.name)

        if context.scored_products:
            logger.info(
                "Pipeline[%s]: top score=%.2f (%s), total scored=%d",
                self.name,
                context.scored_products[0].relevance_score,
                context.scored_products[0].product.name,
                len(context.scored_products),
            )
        return context


# ── Step 7: ResultBuilder ───────────────────────────────────────


class ResultBuilder(PipelineStep):
    """
    Step 7: Picks best_match, budget_option, premium_option and
    generates human-readable recommendation reasons.

    Reads: scored_products, treatment_data, problem_category
    Writes: result (PipelineResult)
    """
    name = "result_builder"

    def run(self, context: PipelineContext) -> PipelineContext:
        scored = context.scored_products
        treatment = context.treatment_data or {}

        treatment_context = TreatmentContext(
            problem_category=context.problem_category,
            product_category=treatment.get("product_category", ""),
            severity=context.problem_severity,
        )

        # No products available
        if not scored:
            context.result = RecommendationResult(
                recommendations=[],
                treatment_context=treatment_context,
                message="No suitable product is currently available.",
            )
            context.steps_executed.append(self.name)
            return context

        recommendations: list[RecommendedProduct] = []
        used_ids: set = set()

        # Best match: highest score
        best = scored[0]
        recommendations.append(self._build_recommendation(
            best, "best_match", context,
        ))
        used_ids.add(best.product.id)

        # Budget option: highest-scored budget-tier product (not already used)
        budget_candidates = [
            s for s in scored
            if s.price_tier == "budget" and s.product.id not in used_ids
        ]
        if budget_candidates:
            budget = budget_candidates[0]
            recommendations.append(self._build_recommendation(
                budget, "budget_option", context,
            ))
            used_ids.add(budget.product.id)

        # Premium option: highest-scored premium-tier product (not already used)
        premium_candidates = [
            s for s in scored
            if s.price_tier == "premium" and s.product.id not in used_ids
        ]
        if premium_candidates:
            premium = premium_candidates[0]
            recommendations.append(self._build_recommendation(
                premium, "premium_option", context,
            ))
            used_ids.add(premium.product.id)

        context.result = RecommendationResult(
            recommendations=recommendations,
            treatment_context=treatment_context,
            message=None,
        )
        context.steps_executed.append(self.name)
        return context

    @staticmethod
    def _build_recommendation(
        scored: ScoredProduct,
        match_type: str,
        context: PipelineContext,
    ) -> RecommendedProduct:
        """Build a RecommendedProduct with a generated reason."""
        product = scored.product
        problem = context.problem_category or "plant care needs"
        treatment = context.treatment_data or {}

        # Generate recommendation reason
        reason_parts = []

        if match_type == "best_match":
            reason_parts.append(
                f"{product.name} is the top recommendation"
            )
        elif match_type == "budget_option":
            reason_parts.append(
                f"Affordable option at ${float(product.price):.2f}"
            )
        elif match_type == "premium_option":
            reason_parts.append(
                f"Premium choice for comprehensive treatment"
            )

        if scored.problem_match:
            cat_label = problem.replace("_", " ")
            reason_parts.append(f"directly targets {cat_label}")

        if scored.species_match:
            reason_parts.append(
                f"specifically compatible with {context.plant_species}"
            )

        if product.brand:
            reason_parts.append(f"by trusted brand {product.brand}")

        reason = ". ".join(reason_parts) + "." if reason_parts else "Suitable product for your plant's needs."

        return RecommendedProduct(
            product=ProductResponse.from_db(product),
            match_type=match_type,
            relevance_score=scored.relevance_score,
            reason=reason,
        )


# ── The Pipeline ────────────────────────────────────────────────


class RecommendationPipeline:
    """
    Sequential product recommendation pipeline.

    Chains 7 steps that each transform a shared PipelineContext.
    Inspired by LangChain's chain pattern — but no external dependency needed.

    Usage:
        pipeline = RecommendationPipeline(db)
        result = pipeline.run(
            treatment_data={"product_category": "fungicide", ...},
            problem_category="fungal_disease",
            problem_severity="medium",
            plant_species="Rose",
        )
        # result is a RecommendationResult
    """

    def __init__(self, db: Session):
        product_repo = ProductRepository(db)

        self.steps: list[PipelineStep] = [
            CategoryResolver(),
            ProductQuery(product_repo),
            CompatibilityFilter(),
            AvailabilityFilter(),
            PriceRanker(),
            RelevanceScorer(),
            ResultBuilder(),
        ]

    def run(
        self,
        treatment_data: dict,
        problem_category: str | None = None,
        problem_severity: str | None = None,
        plant_species: str | None = None,
    ) -> RecommendationResult:
        """
        Execute the full recommendation pipeline.

        Args:
            treatment_data: From CareRecommendation.treatment_data
            problem_category: From CareRecommendation.problem_category
            problem_severity: From CareRecommendation.problem_severity
            plant_species: Common name of the plant

        Returns:
            RecommendationResult with best_match, budget, premium options
            (or empty list with message if no products match).
        """
        context = PipelineContext(
            treatment_data=treatment_data,
            problem_category=problem_category,
            problem_severity=problem_severity,
            plant_species=plant_species,
        )

        logger.info(
            "RecommendationPipeline: starting with problem=%s, severity=%s, species=%s",
            problem_category, problem_severity, plant_species,
        )

        for step in self.steps:
            try:
                context = step.run(context)
            except Exception as e:
                logger.exception(
                    "Pipeline step '%s' failed: %s", step.name, str(e)
                )
                context.errors.append(f"{step.name}: {str(e)}")
                # Continue to next step — graceful degradation
                context.steps_executed.append(f"{step.name} (FAILED)")

        logger.info(
            "RecommendationPipeline: completed. Steps: %s, Recommendations: %d",
            context.steps_executed,
            len(context.result.recommendations) if context.result else 0,
        )

        # If result was never built (ResultBuilder failed), return empty
        if context.result is None:
            return RecommendationResult(
                recommendations=[],
                treatment_context=TreatmentContext(
                    problem_category=problem_category,
                    product_category=treatment_data.get("product_category"),
                    severity=problem_severity,
                ),
                message="Recommendation engine encountered an error. Please try again.",
            )

        return context.result
