"""
Pydantic schemas for the product recommendation agent output.

These define the structured result the product_recommendation_node
returns after the LangChain agent queries real products from the database.

CRITICAL: Product data in these schemas ALWAYS comes from the database
via LangChain tools — the LLM never invents product IDs, names, prices,
stock levels, or URLs.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ProductRecommendation(BaseModel):
    """
    A single product recommendation backed by real database data.

    Every field except `reason` and `recommendation_score` is sourced
    directly from the PostgreSQL products table via LangChain tools.
    """
    product_id: str = Field(
        ..., description="UUID of the product from the database"
    )
    name: str = Field(
        ..., description="Product name from the database"
    )
    reason: str = Field(
        ..., description="LLM-generated explanation of why this product is recommended"
    )
    price: float = Field(
        ..., ge=0.0, description="Product price from the database"
    )
    availability: Literal["in_stock", "low_stock", "out_of_stock"] = Field(
        ..., description="Stock availability status"
    )
    recommendation_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Relevance score computed by the agent (0.0 - 1.0)"
    )
    usage_instructions: Optional[str] = Field(
        default=None,
        description="Product usage instructions from the database"
    )


class ProductRecommendationResult(BaseModel):
    """
    Complete recommendation result from the product recommendation agent.

    Contains up to 3 product recommendations:
    - best_recommendation: highest relevance match
    - budget_alternative: affordable option
    - premium_alternative: comprehensive/premium option

    Status indicates the outcome:
    - "product_recommendation_complete": at least one product found
    - "no_product_available": no compatible products in the database
    """
    best_recommendation: Optional[ProductRecommendation] = Field(
        default=None,
        description="Top product recommendation with highest relevance"
    )
    budget_alternative: Optional[ProductRecommendation] = Field(
        default=None,
        description="More affordable product alternative"
    )
    premium_alternative: Optional[ProductRecommendation] = Field(
        default=None,
        description="Premium/comprehensive product alternative"
    )
    status: Literal[
        "product_recommendation_complete",
        "no_product_available",
    ] = Field(
        default="no_product_available",
        description="Outcome status of the recommendation pipeline"
    )
    reasoning: str = Field(
        default="",
        description="LLM's explanation of the overall selection logic"
    )

    def to_recommended_products_list(self) -> list[dict]:
        """
        Convert to the list[dict] format expected by PlantifyGraphState.recommended_products.
        """
        products = []
        if self.best_recommendation:
            data = self.best_recommendation.model_dump()
            data["match_type"] = "best_match"
            products.append(data)
        if self.budget_alternative:
            data = self.budget_alternative.model_dump()
            data["match_type"] = "budget_option"
            products.append(data)
        if self.premium_alternative:
            data = self.premium_alternative.model_dump()
            data["match_type"] = "premium_option"
            products.append(data)
        return products
