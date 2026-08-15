"""
Plant schemas for CRUD operations.
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PlantCreate(BaseModel):
    """Schema for creating a new plant."""
    name: str = Field(..., min_length=1, max_length=255)
    scientific_name: Optional[str] = Field(None, max_length=255)
    identification_confidence: Optional[float] = Field(None, ge=0.0, le=100.0)
    image_url: Optional[str] = Field(None, max_length=500)


class PlantUpdate(BaseModel):
    """Schema for updating a plant (partial updates)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    scientific_name: Optional[str] = Field(None, max_length=255)
    identification_confidence: Optional[float] = Field(None, ge=0.0, le=100.0)
    image_url: Optional[str] = Field(None, max_length=500)


class PlantImageResponse(BaseModel):
    """Schema for plant image data in API responses."""
    id: uuid.UUID
    image_url: str
    image_type: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PlantResponse(BaseModel):
    """Schema for plant data in API responses."""
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    scientific_name: Optional[str]
    identification_confidence: Optional[float]
    image_url: Optional[str]
    created_at: datetime
    updated_at: datetime
    images: list[PlantImageResponse] = []

    model_config = {"from_attributes": True}
