"""
IdentificationResult model for storing AI plant identification results.

Each PlantScan can have one identification result, which stores the
best-match species info and any alternative matches from Pl@ntNet.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, ForeignKey, DateTime, Text, JSON, UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# Compatible JSON type: PostgreSQL uses JSONB, SQLite falls back to JSON
JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")


class IdentificationResult(Base):
    __tablename__ = "identification_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plant_scans.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Best match fields
    common_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scientific_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    family: Mapped[str | None] = mapped_column(String(255), nullable=True)
    genus: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    # All common names from the best match
    common_names: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Alternative identification results (list of dicts)
    alternatives: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Full raw response from Pl@ntNet for debugging/future use
    raw_response: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Provider that produced this result (e.g. "plantnet")
    provider: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="plantnet"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    scan = relationship("PlantScan", back_populates="identification_result")

    def __repr__(self) -> str:
        return (
            f"<IdentificationResult(id={self.id}, "
            f"common_name={self.common_name}, "
            f"confidence={self.confidence})>"
        )
