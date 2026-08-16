"""
Data access layer for Cart and CartItem models.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from app.models.cart import Cart, CartItem
from app.models.product import Product


class CartRepository:
    """Repository for cart CRUD operations."""

    def __init__(self, db: Session):
        self.db = db

    # ── Cart ─────────────────────────────────────────────────────

    def get_or_create_cart(self, user_id: uuid.UUID) -> Cart:
        """
        Get the user's cart, creating one if it doesn't exist.
        Each user has exactly one cart.
        """
        cart = (
            self.db.query(Cart)
            .filter(Cart.user_id == user_id)
            .first()
        )
        if not cart:
            cart = Cart(user_id=user_id)
            self.db.add(cart)
            self.db.commit()
            self.db.refresh(cart)
        return cart

    def get_cart_with_items(self, user_id: uuid.UUID) -> Optional[Cart]:
        """
        Fetch the user's cart with all items and their product details.
        Returns None if no cart exists.
        """
        return (
            self.db.query(Cart)
            .options(
                joinedload(Cart.items)
                .joinedload(CartItem.product)
                .joinedload(Product.category),
            )
            .filter(Cart.user_id == user_id)
            .first()
        )

    # ── Cart Items ───────────────────────────────────────────────

    def add_item(
        self,
        cart_id: uuid.UUID,
        product_id: uuid.UUID,
        quantity: int,
        price_at_addition: float,
        recommendation_reason: Optional[str] = None,
        scan_id: Optional[uuid.UUID] = None,
    ) -> CartItem:
        """
        Add a product to the cart.

        If the product already exists in the cart, updates the quantity
        and refreshes the price snapshot.
        """
        existing = (
            self.db.query(CartItem)
            .filter(
                CartItem.cart_id == cart_id,
                CartItem.product_id == product_id,
            )
            .first()
        )

        if existing:
            existing.quantity = quantity
            existing.price_at_addition = price_at_addition
            if recommendation_reason:
                existing.recommendation_reason = recommendation_reason
            if scan_id:
                existing.scan_id = scan_id
            self.db.commit()
            self.db.refresh(existing)
            return existing

        item = CartItem(
            cart_id=cart_id,
            product_id=product_id,
            quantity=quantity,
            price_at_addition=price_at_addition,
            recommendation_reason=recommendation_reason,
            scan_id=scan_id,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def get_item_by_id(
        self,
        item_id: uuid.UUID,
    ) -> Optional[CartItem]:
        """Fetch a single cart item with its product."""
        return (
            self.db.query(CartItem)
            .options(
                joinedload(CartItem.product)
                .joinedload(Product.category),
            )
            .filter(CartItem.id == item_id)
            .first()
        )

    def update_item_quantity(
        self,
        item_id: uuid.UUID,
        quantity: int,
    ) -> Optional[CartItem]:
        """Update the quantity of a cart item."""
        item = self.db.query(CartItem).filter(CartItem.id == item_id).first()
        if not item:
            return None
        item.quantity = quantity
        self.db.commit()
        self.db.refresh(item)
        return item

    def remove_item(self, item_id: uuid.UUID) -> bool:
        """Remove an item from the cart. Returns True if deleted."""
        item = self.db.query(CartItem).filter(CartItem.id == item_id).first()
        if not item:
            return False
        self.db.delete(item)
        self.db.commit()
        return True

    def clear_cart(self, cart_id: uuid.UUID) -> int:
        """Remove all items from a cart. Returns count of deleted items."""
        count = (
            self.db.query(CartItem)
            .filter(CartItem.cart_id == cart_id)
            .delete()
        )
        self.db.commit()
        return count
