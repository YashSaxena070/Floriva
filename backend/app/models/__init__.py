"""
Models package - imports all models so Alembic and the ORM can discover them.
"""

from app.models.base import Base, TimestampMixin
from app.models.user import User
from app.models.plant import Plant
from app.models.plant_image import PlantImage
from app.models.plant_scan import PlantScan, ScanStatus
from app.models.health_analysis import HealthAnalysis
from app.models.identification_result import IdentificationResult
from app.models.care_recommendation import CareRecommendation
from app.models.product import Category, Product, ProductCompatibility

__all__ = [
    "Base",
    "TimestampMixin",
    "User",
    "Plant",
    "PlantImage",
    "PlantScan",
    "ScanStatus",
    "HealthAnalysis",
    "IdentificationResult",
    "CareRecommendation",
    "Category",
    "Product",
    "ProductCompatibility",
]


