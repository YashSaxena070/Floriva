"""
Scan router: endpoints for creating and retrieving plant scans,
and AI-powered plant identification.
All endpoints are protected and verify plant ownership.
"""

import uuid

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.scan import ScanResponse, ScanDetailResponse, IdentificationData
from app.schemas.common import SuccessResponse
from app.services.scan_service import ScanService
from app.ai.providers.plantnet_provider import PlantNetError

router = APIRouter(tags=["Scans"])


@router.post(
    "/api/plants/{plant_id}/scans",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_scan(
    plant_id: uuid.UUID,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload an image and create a scan for a plant.

    Steps:
    1. Authenticate the user (via JWT)
    2. Verify plant ownership
    3. Validate the uploaded image
    4. Save the image
    5. Create a PlantScan record with PENDING status
    6. Return the scan ID

    Future: Will queue an AI analysis job after step 5.
    """
    scan_service = ScanService(db)
    try:
        scan = scan_service.create_scan(
            plant_id=plant_id,
            user_id=current_user.id,
            image=image,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    return SuccessResponse(
        data=ScanResponse.model_validate(scan).model_dump(mode="json")
    )


@router.post(
    "/api/plants/{plant_id}/identify",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
async def identify_plant(
    plant_id: uuid.UUID,
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload an image and identify the plant using Pl@ntNet AI.

    Full pipeline:
    1. Authenticate the user (via JWT)
    2. Verify plant ownership
    3. Validate uploaded image
    4. Create a scan record
    5. Call Pl@ntNet API for identification
    6. Store identification results in the database
    7. Update the Plant record with the best match
    8. Return structured identification JSON

    Response shape:
    {
        "success": true,
        "data": {
            "scan_id": "...",
            "plant": {
                "name": "Snake Plant",
                "scientificName": "Dracaena trifasciata",
                "confidence": 0.94
            },
            "alternatives": [...]
        }
    }
    """
    scan_service = ScanService(db)
    try:
        result = await scan_service.identify_plant(
            plant_id=plant_id,
            user_id=current_user.id,
            image=image,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except PlantNetError as e:
        # Map Pl@ntNet errors to appropriate HTTP status codes
        status_code = e.status_code or 502
        if status_code == 404:
            http_status = status.HTTP_422_UNPROCESSABLE_ENTITY
        elif status_code == 429:
            http_status = status.HTTP_429_TOO_MANY_REQUESTS
        elif status_code == 504:
            http_status = status.HTTP_504_GATEWAY_TIMEOUT
        else:
            http_status = status.HTTP_502_BAD_GATEWAY

        raise HTTPException(
            status_code=http_status,
            detail=e.message,
        )

    return SuccessResponse(data=result)


@router.get("/api/plants/{plant_id}/scans", response_model=SuccessResponse)
def list_scans_for_plant(
    plant_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all scans for a specific plant (must be owned by the authenticated user)."""
    scan_service = ScanService(db)
    try:
        scans = scan_service.get_scans_for_plant(plant_id, current_user.id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    return SuccessResponse(
        data=[ScanResponse.model_validate(s).model_dump(mode="json") for s in scans]
    )


@router.get("/api/scans/{scan_id}", response_model=SuccessResponse)
def get_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get detailed scan information including health analyses."""
    scan_service = ScanService(db)
    try:
        scan = scan_service.get_scan(scan_id, current_user.id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    return SuccessResponse(
        data=ScanDetailResponse.model_validate(scan).model_dump(mode="json")
    )

