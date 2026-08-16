"""
API schemas for the shopping cart and external buy links.
"""

import uuid
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


# ── Buy Links (External Stores) ─────────────────────────────────

class BuyLink(BaseModel):
    """An external store link for purchasing a product."""
    store_name: str
    url: str
    search_query: str


# ── Cart Item ────────────────────────────────────────────────────

class CartItemResponse(BaseModel):
    """A single item in the user's cart."""
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_brand: Optional[str] = None
    product_image_url: Optional[str] = None
    category_name: Optional[str] = None
    quantity: int
    price_at_addition: float
    recommendation_reason: Optional[str] = None
    scan_id: Optional[uuid.UUID] = None
    buy_links: list[BuyLink] = []
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_db(cls, item, buy_links: Optional[list[BuyLink]] = None) -> "CartItemResponse":
        """Build from ORM CartItem model."""
        product = item.product
        return cls(
            id=item.id,
            product_id=item.product_id,
            product_name=product.name if product else "Unknown Product",
            product_brand=product.brand if product else None,
            product_image_url=product.image_url if product else None,
            category_name=(
                product.category.name
                if product and product.category
                else None
            ),
            quantity=item.quantity,
            price_at_addition=float(item.price_at_addition),
            recommendation_reason=item.recommendation_reason,
            scan_id=item.scan_id,
            buy_links=buy_links or [],
            created_at=item.created_at,
        )


# ── Cart ─────────────────────────────────────────────────────────

class CartResponse(BaseModel):
    """Full cart with all items."""
    id: uuid.UUID
    user_id: uuid.UUID
    items: list[CartItemResponse] = []
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Cart Requests ────────────────────────────────────────────────

class AddToCartRequest(BaseModel):
    """Request to add a product to the cart."""
    product_id: uuid.UUID
    quantity: int = Field(default=1, ge=1, le=99)
    recommendation_reason: Optional[str] = None
    scan_id: Optional[uuid.UUID] = None


class UpdateCartItemRequest(BaseModel):
    """Request to update a cart item's quantity."""
    quantity: int = Field(..., ge=1, le=99)


# ── Cart Decision (from AI graph) ────────────────────────────────

class CartDecisionResponse(BaseModel):
    """
    The AI's cart decision — sent to the frontend for user confirmation.

    The frontend displays this as:
        "Recommended for your plant:
         Product Name — ₹299
         Reason: Recommended for the detected nutrient deficiency.
         [Add to Cart] [View Details] [Not Now]"
    """
    recommended_product_id: str
    recommended_product_name: str
    recommended_product_price: float
    recommended_product_image: Optional[str] = None
    recommended_product_brand: Optional[str] = None
    quantity: int = 1
    reason: str
    requires_user_confirmation: bool = True
    buy_links: list[BuyLink] = []
    scan_id: Optional[str] = None


# ── Cart Approval Request ────────────────────────────────────────

class CartApprovalRequest(BaseModel):
    """Request to approve or decline a cart action from the AI graph."""
    action: str = Field(
        ...,
        description="User's decision: 'approve' or 'decline'",
        pattern="^(approve|decline)$",
    )
