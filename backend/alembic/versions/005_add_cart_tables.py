"""Add cart and cart_items tables

Revision ID: 005
Revises: 004
Create Date: 2024-01-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Carts ───────────────────────────────────────────────────
    op.create_table(
        "carts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_carts_user_id", "carts", ["user_id"], unique=True)

    # ── Cart Items ──────────────────────────────────────────────
    op.create_table(
        "cart_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "cart_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("carts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("price_at_addition", sa.Numeric(10, 2), nullable=False),
        sa.Column("recommendation_reason", sa.Text, nullable=True),
        sa.Column(
            "scan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plant_scans.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("cart_id", "product_id", name="uq_cart_product"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])
    op.create_index("ix_cart_items_product_id", "cart_items", ["product_id"])


def downgrade() -> None:
    op.drop_table("cart_items")
    op.drop_table("carts")
