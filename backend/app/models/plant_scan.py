"""
PlantScan model for tracking scan/analysis jobs.
"""

import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime, Enum, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ScanStatus(str, enum.Enum):
    """Possible statuses for a plant scan job."""
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class PlantScan(Base):
    __tablename__ = "plant_scans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus, name="scan_status", create_constraint=True),
        default=ScanStatus.PENDING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    plant = relationship("Plant", back_populates="scans")
    health_analyses = relationship(
        "HealthAnalysis", back_populates="scan", cascade="all, delete-orphan"
    )
    identification_result = relationship(
        "IdentificationResult",
        back_populates="scan",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<PlantScan(id={self.id}, status={self.status})>"
