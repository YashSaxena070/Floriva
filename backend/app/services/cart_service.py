"""
Cart service: business logic for the saved recommendations cart
and external buy link generation.

NOTE: Plantify does NOT have an e-commerce store. The cart stores
AI-recommended products. When the user clicks on a product, they are
redirected to external retailers (Amazon, Google Shopping, etc.).
"""

import uuid
import logging
from typing import Optional
from urllib.parse import quote_plus

from sqlalchemy.orm import Session

from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.repositories.cart_repository import CartRepository
from app.repositories.product_repository import ProductRepository
from app.schemas.cart import (
    BuyLink,
    CartItemResponse,
    CartResponse,
)

logger = logging.getLogger(__name__)


# ── External Store Config ───────────────────────────────────────

EXTERNAL_STORES = [
    {
        "name": "Amazon",
        "url_template": "https://www.amazon.in/s?k={query}",
    },
    {
        "name": "Flipkart",
        "url_template": "https://www.flipkart.com/search?q={query}",
    },
    {
        "name": "Google Shopping",
        "url_template": "https://www.google.com/search?tbm=shop&q={query}",
    },
    {
        "name": "Ugaoo",
        "url_template": "https://www.ugaoo.com/search?q={query}",
    },
    {
        "name": "Nurserylive",
        "url_template": "https://nurserylive.com/search?q={query}",
    },
]


def generate_buy_links(product_name: str, brand: str | None = None) -> list[BuyLink]:
    """
    Generate external retailer search URLs for a product.

    Builds a search query from the product name + brand and creates
    links for each configured external store.
    """
    parts = []
    if brand:
        parts.append(brand)
    parts.append(product_name)
    search_query = " ".join(parts)
    encoded_query = quote_plus(search_query)

    links = []
    for store in EXTERNAL_STORES:
        links.append(BuyLink(
            store_name=store["name"],
            url=store["url_template"].format(query=encoded_query),
            search_query=search_query,
        ))
    return links


# ── Cart Service ────────────────────────────────────────────────


class CartService:
    """Business logic for cart operations and external buy links."""

    def __init__(self, db: Session):
        self.db = db
        self.cart_repo = CartRepository(db)
        self.product_repo = ProductRepository(db)

    # ── Read ─────────────────────────────────────────────────────

    def get_cart(self, user_id: uuid.UUID) -> CartResponse:
        """Get the user's cart with all items and buy links."""
        cart = self.cart_repo.get_cart_with_items(user_id)

        if not cart:
            # Create empty cart
            cart = self.cart_repo.get_or_create_cart(user_id)
            return CartResponse(
                id=cart.id,
                user_id=cart.user_id,
                items=[],
                item_count=0,
                created_at=cart.created_at,
                updated_at=cart.updated_at,
            )

        items = []
        for item in cart.items:
            buy_links = generate_buy_links(
                product_name=item.product.name if item.product else "",
                brand=item.product.brand if item.product else None,
            )
            items.append(CartItemResponse.from_db(item, buy_links=buy_links))

        return CartResponse(
            id=cart.id,
            user_id=cart.user_id,
            items=items,
            item_count=len(items),
            created_at=cart.created_at,
            updated_at=cart.updated_at,
        )

    # ── Add ──────────────────────────────────────────────────────

    def add_item(
        self,
        user_id: uuid.UUID,
        product_id: uuid.UUID,
        quantity: int = 1,
        recommendation_reason: Optional[str] = None,
        scan_id: Optional[uuid.UUID] = None,
    ) -> CartItemResponse:
        """
        Add a product to the user's cart.

        Validation:
        1. Product exists
        2. Product is active
        3. Quantity is valid (≥ 1)
        4. Current price is fetched from PostgreSQL

        Stores the actual price at the time of adding.

        Args:
            user_id: The authenticated user's ID.
            product_id: UUID of the product to add.
            quantity: Number of units (default 1).
            recommendation_reason: AI-generated reason (optional).
            scan_id: Scan that triggered the recommendation (optional).

        Returns:
            CartItemResponse with product details and buy links.

        Raises:
            ValueError: If product not found or inactive.
        """
        # 1. Product exists
        product = self.product_repo.get_product_by_id(product_id)
        if not product:
            raise ValueError("Product not found")

        # 2. Product is active
        if not product.active:
            raise ValueError("Product is no longer available")

        # 3. Quantity validation
        if quantity < 1:
            raise ValueError("Quantity must be at least 1")

        # 4. Fetch current price from database
        current_price = float(product.price)

        # Get or create the user's cart
        cart = self.cart_repo.get_or_create_cart(user_id)

        # Add item
        item = self.cart_repo.add_item(
            cart_id=cart.id,
            product_id=product_id,
            quantity=quantity,
            price_at_addition=current_price,
            recommendation_reason=recommendation_reason,
            scan_id=scan_id,
        )

        # Reload with relationships
        item = self.cart_repo.get_item_by_id(item.id)

        buy_links = generate_buy_links(
            product_name=product.name,
            brand=product.brand,
        )

        logger.info(
            "CartService: added product '%s' (₹%.2f) to cart for user %s",
            product.name, current_price, user_id,
        )

        return CartItemResponse.from_db(item, buy_links=buy_links)

    # ── Update ───────────────────────────────────────────────────

    def update_item(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        quantity: int,
    ) -> CartItemResponse:
        """
        Update the quantity of a cart item.

        Validates that the item belongs to the user's cart.
        """
        item = self.cart_repo.get_item_by_id(item_id)
        if not item:
            raise ValueError("Cart item not found")

        # Verify ownership
        cart = self.cart_repo.get_or_create_cart(user_id)
        if item.cart_id != cart.id:
            raise ValueError("Cart item not found")

        if quantity < 1:
            raise ValueError("Quantity must be at least 1")

        item = self.cart_repo.update_item_quantity(item_id, quantity)
        item = self.cart_repo.get_item_by_id(item.id)

        buy_links = generate_buy_links(
            product_name=item.product.name if item.product else "",
            brand=item.product.brand if item.product else None,
        )

        return CartItemResponse.from_db(item, buy_links=buy_links)

    # ── Remove ───────────────────────────────────────────────────

    def remove_item(
        self,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
    ) -> bool:
        """
        Remove an item from the user's cart.

        Validates ownership before deletion.
        """
        item = self.cart_repo.get_item_by_id(item_id)
        if not item:
            raise ValueError("Cart item not found")

        cart = self.cart_repo.get_or_create_cart(user_id)
        if item.cart_id != cart.id:
            raise ValueError("Cart item not found")

        return self.cart_repo.remove_item(item_id)

    # ── Buy Links Helper ─────────────────────────────────────────

    def get_buy_links_for_product(
        self,
        product_id: uuid.UUID,
    ) -> list[BuyLink]:
        """Generate external buy links for a specific product."""
        product = self.product_repo.get_product_by_id(product_id)
        if not product:
            raise ValueError("Product not found")
        return generate_buy_links(
            product_name=product.name,
            brand=product.brand,
        )
