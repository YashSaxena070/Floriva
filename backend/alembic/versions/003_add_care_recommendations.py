"""Add care_recommendations table

Revision ID: 003
Revises: 002
Create Date: 2024-01-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Care Recommendations ────────────────────────────────────
    op.create_table(
        "care_recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "scan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plant_scans.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("summary", sa.Text, nullable=True),
        sa.Column("care_data", postgresql.JSONB, nullable=True),
        sa.Column("problem_detected", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("problem_category", sa.String(50), nullable=True),
        sa.Column("problem_severity", sa.String(20), nullable=True),
        sa.Column("treatment_data", postgresql.JSONB, nullable=True),
        sa.Column("raw_llm_response", postgresql.JSONB, nullable=True),
        sa.Column("provider", sa.String(50), nullable=True, server_default="groq"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_care_recommendations_scan_id",
        "care_recommendations",
        ["scan_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("care_recommendations")
