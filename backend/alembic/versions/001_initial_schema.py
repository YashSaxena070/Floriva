"""Initial schema - users, plants, plant_images, plant_scans, health_analyses

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Users ────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
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
    op.create_index("ix_users_email", "users", ["email"])

    # ── Plants ───────────────────────────────────────────────
    op.create_table(
        "plants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("scientific_name", sa.String(255), nullable=True),
        sa.Column("identification_confidence", sa.Float, nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
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
    op.create_index("ix_plants_user_id", "plants", ["user_id"])
    op.create_index("ix_plants_user_id_name", "plants", ["user_id", "name"])

    # ── Plant Images ─────────────────────────────────────────
    op.create_table(
        "plant_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "plant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("image_url", sa.String(500), nullable=False),
        sa.Column("image_type", sa.String(50), nullable=True, server_default="scan"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_plant_images_plant_id", "plant_images", ["plant_id"])

    # ── Scan Status Enum ─────────────────────────────────────
    scan_status_enum = sa.Enum(
        "PENDING", "PROCESSING", "COMPLETED", "FAILED",
        name="scan_status",
    )

    # ── Plant Scans ──────────────────────────────────────────
    op.create_table(
        "plant_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "plant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("image_url", sa.String(500), nullable=False),
        sa.Column(
            "status",
            scan_status_enum,
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_plant_scans_plant_id", "plant_scans", ["plant_id"])

    # ── Health Analyses ──────────────────────────────────────
    op.create_table(
        "health_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "scan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plant_scans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("health_status", sa.String(50), nullable=True),
        sa.Column("issue", sa.Text, nullable=True),
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("severity", sa.String(50), nullable=True),
        sa.Column("symptoms", postgresql.JSONB, nullable=True),
        sa.Column("possible_causes", postgresql.JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_health_analyses_scan_id", "health_analyses", ["scan_id"])


def downgrade() -> None:
    op.drop_table("health_analyses")
    op.drop_table("plant_scans")

    # Drop the enum type after dropping the table that uses it
    scan_status_enum = postgresql.ENUM(
        "PENDING", "PROCESSING", "COMPLETED", "FAILED",
        name="scan_status",
    )
    scan_status_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_table("plant_images")
    op.drop_table("plants")
    op.drop_table("users")
