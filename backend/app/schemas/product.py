"""
API schemas for product catalog and recommendations.
"""

import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel


# ── Category ────────────────────────────────────────────────────

class CategoryResponse(BaseModel):
    """Category data in API responses."""
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Product ─────────────────────────────────────────────────────

class ProductResponse(BaseModel):
    """Product summary in list API responses."""
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    category_id: uuid.UUID
    category_name: Optional[str] = None
    price: float
    image_url: Optional[str] = None
    stock: int = 0
    brand: Optional[str] = None
    active: bool = True

    model_config = {"from_attributes": True}

    @classmethod
    def from_db(cls, product) -> "ProductResponse":
        """Build from ORM model, extracting category name."""
        return cls(
            id=product.id,
            name=product.name,
            description=product.description,
            category_id=product.category_id,
            category_name=product.category.name if product.category else None,
            price=float(product.price),
            image_url=product.image_url,
            stock=product.stock,
            brand=product.brand,
            active=product.active,
        )


class ProductDetailResponse(ProductResponse):
    """Full product detail with usage instructions and compatibility."""
    usage_instructions: Optional[str] = None
    compatibilities: list[dict] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def from_db(cls, product) -> "ProductDetailResponse":
        """Build from ORM model with full details."""
        compatibilities = []
        for c in (product.compatibilities or []):
            compatibilities.append({
                "problem_category": c.problem_category,
                "plant_species": c.plant_species,
            })

        return cls(
            id=product.id,
            name=product.name,
            description=product.description,
            category_id=product.category_id,
            category_name=product.category.name if product.category else None,
            price=float(product.price),
            image_url=product.image_url,
            stock=product.stock,
            brand=product.brand,
            active=product.active,
            usage_instructions=product.usage_instructions,
            compatibilities=compatibilities,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )


# ── Recommendation ──────────────────────────────────────────────

class RecommendedProduct(BaseModel):
    """A single product recommendation with match metadata."""
    product: ProductResponse
    match_type: str  # "best_match", "budget_option", "premium_option"
    relevance_score: float
    reason: str


class TreatmentContext(BaseModel):
    """Context about why the recommendation was made."""
    problem_category: Optional[str] = None
    product_category: Optional[str] = None
    severity: Optional[str] = None


class RecommendationResult(BaseModel):
    """
    Full recommendation response.

    When no suitable products exist:
        recommendations = []
        message = "No suitable product is currently available."
    """
    recommendations: list[RecommendedProduct] = []
    treatment_context: TreatmentContext = TreatmentContext()
    message: Optional[str] = None
