"""
PlantImage model for storing multiple images per plant.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, ForeignKey, DateTime, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PlantImage(Base):
    __tablename__ = "plant_images"

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
    image_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="scan"
    )  # scan, profile, gallery
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    plant = relationship("Plant", back_populates="images")

    def __repr__(self) -> str:
        return f"<PlantImage(id={self.id}, plant_id={self.plant_id})>"
