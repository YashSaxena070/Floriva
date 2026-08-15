"""Add identification_results table

Revision ID: 002
Revises: 001
Create Date: 2024-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Identification Results ───────────────────────────────
    op.create_table(
        "identification_results",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "scan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plant_scans.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("common_name", sa.String(255), nullable=True),
        sa.Column("scientific_name", sa.String(255), nullable=True),
        sa.Column("family", sa.String(255), nullable=True),
        sa.Column("genus", sa.String(255), nullable=True),
        sa.Column("confidence", sa.Float, nullable=True),
        sa.Column("common_names", postgresql.JSONB, nullable=True),
        sa.Column("alternatives", postgresql.JSONB, nullable=True),
        sa.Column("raw_response", postgresql.JSONB, nullable=True),
        sa.Column("provider", sa.String(50), nullable=True, server_default="plantnet"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_identification_results_scan_id",
        "identification_results",
        ["scan_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("identification_results")
