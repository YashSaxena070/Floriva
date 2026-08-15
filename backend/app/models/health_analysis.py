"""
HealthAnalysis model for storing AI analysis results of plant scans.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, ForeignKey, DateTime, Text, JSON, UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# Compatible JSON type: PostgreSQL uses JSONB, SQLite falls back to JSON
JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")


class HealthAnalysis(Base):
    __tablename__ = "health_analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plant_scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    health_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    issue: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    severity: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # JSON fields for structured AI results
    symptoms: Mapped[dict | None] = mapped_column(JSON_TYPE, nullable=True, default=None)
    possible_causes: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    scan = relationship("PlantScan", back_populates="health_analyses")

    def __repr__(self) -> str:
        return f"<HealthAnalysis(id={self.id}, health_status={self.health_status})>"
