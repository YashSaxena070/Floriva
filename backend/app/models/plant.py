"""
Plant model representing a user's identified plant.
"""

import uuid

from sqlalchemy import String, Float, ForeignKey, Index, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Plant(TimestampMixin, Base):
    __tablename__ = "plants"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    identification_confidence: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    user = relationship("User", back_populates="plants")
    images = relationship(
        "PlantImage", back_populates="plant", cascade="all, delete-orphan"
    )
    scans = relationship(
        "PlantScan", back_populates="plant", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_plants_user_id_name", "user_id", "name"),
    )

    def __repr__(self) -> str:
        return f"<Plant(id={self.id}, name={self.name})>"
