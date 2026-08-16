"""
LangChain tools for cart operations.

These tools allow the add_to_cart graph node to interact with the
real PostgreSQL cart tables via the CartService.

CRITICAL RULES:
    - Tools operate on real database records only.
    - Product prices come from the database, never the LLM.
    - The LLM must NOT auto-purchase or bypass user confirmation.
"""

import json
import logging
import uuid
from typing import Optional

from langchain_core.tools import tool, BaseTool, ToolException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.repositories.cart_repository import CartRepository
from app.repositories.product_repository import ProductRepository
from app.services.cart_service import CartService, generate_buy_links

logger = logging.getLogger(__name__)


# ── Tool Input Schemas ──────────────────────────────────────────

class GetCartInput(BaseModel):
    """Input for get_cart tool."""
    user_id: str = Field(
        ..., description="UUID of the user whose cart to retrieve."
    )


class AddToCartInput(BaseModel):
    """Input for add_to_cart tool."""
    user_id: str = Field(
        ..., description="UUID of the user."
    )
    product_id: str = Field(
        ..., description="UUID of the product to add. Must be from a previous search."
    )
    quantity: int = Field(
        default=1, ge=1,
        description="Quantity to add (default 1)."
    )
    recommendation_reason: Optional[str] = Field(
        default=None,
        description="AI-generated reason for this recommendation."
    )
    scan_id: Optional[str] = Field(
        default=None,
        description="UUID of the scan that triggered this recommendation."
    )


class UpdateCartInput(BaseModel):
    """Input for update_cart tool."""
    user_id: str = Field(
        ..., description="UUID of the user."
    )
    item_id: str = Field(
        ..., description="UUID of the cart item to update."
    )
    quantity: int = Field(
        ..., ge=1, description="New quantity."
    )


class RemoveFromCartInput(BaseModel):
    """Input for remove_from_cart tool."""
    user_id: str = Field(
        ..., description="UUID of the user."
    )
    item_id: str = Field(
        ..., description="UUID of the cart item to remove."
    )


class ValidateCartItemInput(BaseModel):
    """Input for validate_cart_item tool."""
    product_id: str = Field(
        ..., description="UUID of the product to validate."
    )


# ── Tool Factory ────────────────────────────────────────────────


def create_cart_tools(db: Session, user_id: str) -> list[BaseTool]:
    """
    Factory that creates LangChain cart tools bound to a database session
    and user ID.

    Args:
        db: SQLAlchemy Session for database queries.
        user_id: The authenticated user's UUID string.

    Returns:
        List of 5 LangChain tools for cart operations.
    """
    cart_service = CartService(db)
    product_repo = ProductRepository(db)

    # ── Tool 1: get_cart ────────────────────────────────────────

    @tool("get_cart", args_schema=GetCartInput)
    def get_cart(user_id: str) -> str:
        """
        Get the user's current cart with all items and external buy links.
        Returns a JSON representation of the cart contents.
        """
        try:
            user_uuid = uuid.UUID(user_id)
            cart = cart_service.get_cart(user_uuid)
            return json.dumps(cart.model_dump(mode="json"), default=str)
        except Exception as e:
            logger.exception("Tool[get_cart] error: %s", e)
            raise ToolException(f"Failed to get cart: {str(e)}")

    # ── Tool 2: add_to_cart ─────────────────────────────────────

    @tool("add_to_cart", args_schema=AddToCartInput)
    def add_to_cart(
        user_id: str,
        product_id: str,
        quantity: int = 1,
        recommendation_reason: Optional[str] = None,
        scan_id: Optional[str] = None,
    ) -> str:
        """
        Add a product to the user's cart.

        Validates:
        1. Product exists in the database
        2. Product is active
        3. Stores the real price from the database

        Returns the cart item with external buy links for purchasing.
        The product_id MUST be a valid UUID from a previous search.
        """
        try:
            user_uuid = uuid.UUID(user_id)
            product_uuid = uuid.UUID(product_id)
            scan_uuid = uuid.UUID(scan_id) if scan_id else None

            item_response = cart_service.add_item(
                user_id=user_uuid,
                product_id=product_uuid,
                quantity=quantity,
                recommendation_reason=recommendation_reason,
                scan_id=scan_uuid,
            )

            logger.info(
                "Tool[add_to_cart]: Added product %s to cart for user %s",
                product_id, user_id,
            )
            return json.dumps(item_response.model_dump(mode="json"), default=str)
        except ValueError as e:
            return json.dumps({"error": str(e), "success": False})
        except Exception as e:
            logger.exception("Tool[add_to_cart] error: %s", e)
            raise ToolException(f"Failed to add to cart: {str(e)}")

    # ── Tool 3: update_cart ─────────────────────────────────────

    @tool("update_cart", args_schema=UpdateCartInput)
    def update_cart(
        user_id: str,
        item_id: str,
        quantity: int,
    ) -> str:
        """
        Update the quantity of a cart item.
        The item must belong to the user's cart.
        """
        try:
            user_uuid = uuid.UUID(user_id)
            item_uuid = uuid.UUID(item_id)

            item_response = cart_service.update_item(
                user_id=user_uuid,
                item_id=item_uuid,
                quantity=quantity,
            )
            return json.dumps(item_response.model_dump(mode="json"), default=str)
        except ValueError as e:
            return json.dumps({"error": str(e), "success": False})
        except Exception as e:
            logger.exception("Tool[update_cart] error: %s", e)
            raise ToolException(f"Failed to update cart: {str(e)}")

    # ── Tool 4: remove_from_cart ────────────────────────────────

    @tool("remove_from_cart", args_schema=RemoveFromCartInput)
    def remove_from_cart(
        user_id: str,
        item_id: str,
    ) -> str:
        """
        Remove an item from the user's cart.
        The item must belong to the user's cart.
        """
        try:
            user_uuid = uuid.UUID(user_id)
            item_uuid = uuid.UUID(item_id)

            removed = cart_service.remove_item(
                user_id=user_uuid,
                item_id=item_uuid,
            )
            return json.dumps({
                "success": removed,
                "message": "Item removed from cart." if removed else "Item not found.",
            })
        except ValueError as e:
            return json.dumps({"error": str(e), "success": False})
        except Exception as e:
            logger.exception("Tool[remove_from_cart] error: %s", e)
            raise ToolException(f"Failed to remove from cart: {str(e)}")

    # ── Tool 5: validate_cart_item ──────────────────────────────

    @tool("validate_cart_item", args_schema=ValidateCartItemInput)
    def validate_cart_item(product_id: str) -> str:
        """
        Validate that a product can be added to the cart.

        Checks:
        1. Product exists in the database
        2. Product is active
        3. Product price is available

        Returns validation result with product details and buy links.
        """
        try:
            product_uuid = uuid.UUID(product_id)
            product = product_repo.get_product_by_id(product_uuid)

            if not product:
                return json.dumps({
                    "valid": False,
                    "error": "Product not found in database.",
                })

            if not product.active:
                return json.dumps({
                    "valid": False,
                    "error": "Product is no longer available.",
                    "product_name": product.name,
                })

            buy_links = generate_buy_links(
                product_name=product.name,
                brand=product.brand,
            )

            return json.dumps({
                "valid": True,
                "product_id": str(product.id),
                "product_name": product.name,
                "product_brand": product.brand or "",
                "price": float(product.price),
                "active": product.active,
                "image_url": product.image_url or "",
                "buy_links": [link.model_dump() for link in buy_links],
            })
        except ValueError:
            return json.dumps({
                "valid": False,
                "error": f"Invalid product ID format: {product_id}",
            })
        except Exception as e:
            logger.exception("Tool[validate_cart_item] error: %s", e)
            raise ToolException(f"Validation failed: {str(e)}")

    return [get_cart, add_to_cart, update_cart, remove_from_cart, validate_cart_item]
