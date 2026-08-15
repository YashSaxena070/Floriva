"""
CareRecommendation model for storing AI-generated plant care and treatment plans.

Each PlantScan can have one care recommendation, which stores the full
personalized care plan, problem diagnosis, and treatment instructions
produced by the AI analysis engine.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, ForeignKey, DateTime, Text, JSON, UUID
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# Compatible JSON type: PostgreSQL uses JSONB, SQLite falls back to JSON
JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")


class CareRecommendation(Base):
    __tablename__ = "care_recommendations"

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

    # AI-generated summary of the plant's condition and care needs
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Full care plan as structured JSON
    # Schema: { watering, sunlight, temperature, humidity, soil, fertilization, pruning }
    care_data: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Problem detection — extracted top-level fields for querying
    problem_detected: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    problem_category: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    problem_severity: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )

    # Full treatment plan as structured JSON
    # Schema: { required, productCategory, recommendedActions, frequency, ... }
    treatment_data: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Raw LLM output preserved for auditing / debugging
    raw_llm_response: Mapped[dict | None] = mapped_column(
        JSON_TYPE, nullable=True, default=None
    )

    # Which AI provider generated this recommendation
    provider: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="groq"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    scan = relationship("PlantScan", back_populates="care_recommendation")

    def __repr__(self) -> str:
        return (
            f"<CareRecommendation(id={self.id}, "
            f"problem_detected={self.problem_detected}, "
            f"provider={self.provider})>"
        )
