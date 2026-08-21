"""
Plant router: CRUD endpoints for plant management.
All endpoints are protected and scoped to the authenticated user.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.plant import (
    PlantCreate,
    PlantUpdate,
    PlantResponse,
    HealthScanRecordCreate,
    HealthTimelinePoint,
)
from app.schemas.common import SuccessResponse
from app.services.plant_service import PlantService

router = APIRouter(prefix="/api/plants", tags=["Plants"])


@router.post(
    "",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plant(
    payload: PlantCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new plant with initial health baseline for the authenticated user."""
    plant_service = PlantService(db)
    plant = plant_service.create_plant(
        user_id=current_user.id,
        name=payload.name,
        scientific_name=payload.scientific_name,
        identification_confidence=payload.identification_confidence,
        image_url=payload.image_url,
    )
    return SuccessResponse(data=plant_service.format_plant_response(plant))


@router.get("", response_model=SuccessResponse)
def list_plants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all plants belonging to the authenticated user with their health timelines."""
    plant_service = PlantService(db)
    plants = plant_service.get_user_plants(current_user.id)
    return SuccessResponse(
        data=[plant_service.format_plant_response(p) for p in plants]
    )


@router.get("/{plant_id}", response_model=SuccessResponse)
def get_plant(
    plant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific plant by ID with its complete health timeline."""
    plant_service = PlantService(db)
    try:
        plant = plant_service.get_plant(plant_id, current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return SuccessResponse(data=plant_service.format_plant_response(plant))


@router.patch("/{plant_id}", response_model=SuccessResponse)
def update_plant(
    plant_id: uuid.UUID,
    payload: PlantUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a plant (partial update, must be owned by the authenticated user)."""
    plant_service = PlantService(db)
    update_data = payload.model_dump(exclude_unset=True)

    try:
        plant = plant_service.update_plant(plant_id, current_user.id, update_data)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return SuccessResponse(data=plant_service.format_plant_response(plant))


@router.delete("/{plant_id}", response_model=SuccessResponse)
def delete_plant(
    plant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a plant (must be owned by the authenticated user)."""
    plant_service = PlantService(db)
    try:
        plant_service.delete_plant(plant_id, current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return SuccessResponse(data={"message": "Plant deleted successfully"})


@router.post(
    "/{plant_id}/health-scans",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
)
def record_health_scan(
    plant_id: uuid.UUID,
    payload: HealthScanRecordCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a health scan point for a plant and persist it to the database."""
    plant_service = PlantService(db)
    try:
        point = plant_service.add_health_scan(
            plant_id=plant_id,
            user_id=current_user.id,
            score=payload.score,
            health_status=payload.health_status,
            issue=payload.issue,
            image_url=payload.image_url,
            date_ms=payload.date,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return SuccessResponse(data=point)


@router.get("/{plant_id}/health-timeline", response_model=SuccessResponse)
def get_plant_health_timeline(
    plant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the full chronological health timeline for a plant from the database."""
    plant_service = PlantService(db)
    try:
        timeline = plant_service.get_health_timeline(plant_id, current_user.id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )
    return SuccessResponse(data=timeline)
