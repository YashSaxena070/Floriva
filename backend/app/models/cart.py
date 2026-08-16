"""
Cart models: Cart and CartItem.

Cart — a user's saved product recommendations (one per user).
CartItem — a recommended product saved to the cart with an external buy link.

NOTE: Plantify does NOT have an e-commerce store. The cart serves as a
"saved recommendations" list. When the user clicks on a product, they
are redirected to external stores (Amazon, Google Shopping, etc.) to
complete the purchase.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    String, Text, Integer, Boolean, ForeignKey,
    DateTime, Numeric, Index, UUID, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Cart(TimestampMixin, Base):
    """
    A user's saved recommendations cart.

    Each user has at most one active cart (get-or-create pattern).
    The cart stores AI-recommended products for the user to browse
    and purchase from external retailers.
    """

    __tablename__ = "carts"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Relationships
    user = relationship("User", backref="cart")
    items = relationship(
        "CartItem",
        back_populates="cart",
        cascade="all, delete-orphan",
        order_by="CartItem.created_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<Cart(id={self.id}, user_id={self.user_id})>"


class CartItem(TimestampMixin, Base):
    """
    A single product in a user's cart.

    Stores a snapshot of the product price at the time of recommendation,
    along with the AI's reason for recommending and a link to the scan
    that triggered the recommendation.

    The buy_url field stores the external retailer URL for purchasing.
    """

    __tablename__ = "cart_items"

    cart_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("carts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1,
    )
    price_at_addition: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False,
        doc="Snapshot of the product price when added to cart.",
    )
    recommendation_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        doc="AI-generated reason for recommending this product.",
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plant_scans.id", ondelete="SET NULL"),
        nullable=True,
        doc="The scan that triggered this recommendation (if any).",
    )

    # Relationships
    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")
    scan = relationship("PlantScan")

    __table_args__ = (
        UniqueConstraint(
            "cart_id", "product_id",
            name="uq_cart_product",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<CartItem(id={self.id}, product_id={self.product_id}, "
            f"qty={self.quantity})>"
        )
