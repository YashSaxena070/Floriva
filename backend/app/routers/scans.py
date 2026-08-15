"""
Scan router: endpoints for creating and retrieving plant scans,
AI-powered plant identification, health/disease analysis,
and personalized care & treatment recommendations.
All endpoints are protected and verify plant ownership.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.scan import ScanResponse, ScanDetailResponse, IdentificationData
from app.schemas.common import SuccessResponse
from app.services.scan_service import ScanService
from app.ai.providers.plantnet_provider import PlantNetError
from app.ai.providers.groq_health_provider import GroqHealthError
from app.ai.services.ai_analysis_service import AIAnalysisError

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
    Upload an image and identify the plant using Pl@ntNet AI,
    then run health/disease analysis using Groq vision.

    Full pipeline:
    1. Authenticate the user (via JWT)
    2. Verify plant ownership
    3. Validate uploaded image
    4. Create a scan record
    5. Call Pl@ntNet API for identification
    6. Store identification results in the database
    7. Update the Plant record with the best match
    8. Run health/disease analysis via Groq vision
    9. Store health analysis in HealthAnalysis table
    10. Return structured identification + health JSON

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
            "alternatives": [...],
            "healthAnalysis": {
                "healthStatus": "healthy",
                "issue": "No issues detected",
                "confidence": 0.92,
                "severity": "low",
                "symptoms": [],
                "possibleCauses": []
            }
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


@router.post(
    "/api/scans/{scan_id}/health-analysis",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
async def analyze_health(
    scan_id: uuid.UUID,
    plant_name: Optional[str] = Body(None),
    scientific_name: Optional[str] = Body(None),
    image_url: Optional[str] = Body(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run health/disease analysis on an existing scan.

    Used by the 'Diagnose Health' button. Sends the scan's image
    to Groq vision for health analysis and stores the result.

    Request body (all optional):
    {
        "plant_name": "Snake Plant",
        "scientific_name": "Dracaena trifasciata",
        "image_url": "/uploads/scans/.../image.jpg"
    }

    Response:
    {
        "success": true,
        "data": {
            "healthStatus": "healthy" | "warning" | "diseased",
            "issue": "string",
            "confidence": 0.92,
            "severity": "low" | "medium" | "high",
            "symptoms": [],
            "possibleCauses": []
        }
    }
    """
    scan_service = ScanService(db)
    try:
        result = await scan_service.analyze_health(
            scan_id=scan_id,
            user_id=current_user.id,
            plant_name=plant_name,
            scientific_name=scientific_name,
            image_url=image_url,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except GroqHealthError as e:
        status_code = e.status_code or 502
        if status_code == 429:
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


# ── AI Care & Treatment Analysis Endpoints ───────────────────────


@router.post(
    "/api/scans/{scan_id}/analyze",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
async def analyze_scan(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run full AI care & treatment analysis on a completed scan.

    Requires:
    - Scan must be in COMPLETED status
    - Scan must have identification data (run plant identification first)

    Pipeline:
    1. Gather context (identification, health, scan history)
    2. Query KnowledgeService for curated plant care data
    3. Send to AI (LLM) for personalized care + treatment analysis
    4. Validate LLM response through Pydantic schemas
    5. Persist validated result to CareRecommendation table
    6. Return the complete recommendation

    If a recommendation already exists for this scan, it is overwritten
    with the new analysis (re-analysis is supported).

    Response:
    {
        "success": true,
        "data": {
            "id": "uuid",
            "scan_id": "uuid",
            "summary": "Your Snake Plant is healthy and thriving...",
            "care": {
                "watering": "Water every 2-3 weeks...",
                "sunlight": "Low to bright indirect light...",
                "temperature": "60-85°F (15-29°C)...",
                "humidity": "Average room humidity...",
                "soil": "Well-draining cactus mix...",
                "fertilization": "Feed sparingly...",
                "pruning": "Remove dead leaves..."
            },
            "problem": {
                "detected": false,
                "name": "",
                "category": "healthy",
                "severity": "none",
                "description": ""
            },
            "treatment": {
                "required": false,
                "product_category": "",
                "recommended_actions": [],
                "frequency": "",
                "estimated_duration": "",
                "precautions": [],
                "instructions": ""
            },
            "provider": "groq",
            "created_at": "2024-01-15T10:30:00+00:00"
        }
    }
    """
    scan_service = ScanService(db)
    try:
        result = await scan_service.run_analysis(
            scan_id=scan_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        error_msg = str(e)
        # Distinguish between "not found" and "bad state" errors
        if "not found" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error_msg,
            )
    except AIAnalysisError as e:
        status_code = e.status_code or 502
        if status_code == 429:
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


@router.get(
    "/api/scans/{scan_id}/recommendation",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def get_recommendation(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve a previously generated care recommendation for a scan.

    Returns 404 if no recommendation exists yet (run POST /analyze first).

    Response:
    {
        "success": true,
        "data": {
            "id": "uuid",
            "scan_id": "uuid",
            "summary": "...",
            "care": { ... },
            "problem": { ... },
            "treatment": { ... },
            "provider": "groq",
            "created_at": "..."
        }
    }
    """
    scan_service = ScanService(db)
    try:
        result = scan_service.get_recommendation(
            scan_id=scan_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return SuccessResponse(data=result)


@router.post(
    "/api/scans/{scan_id}/pipeline",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
async def run_scan_pipeline(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute the end-to-end LangGraph pipeline for a scan:
    image_validation -> plant_identification -> health_analysis ->
    plant_analysis -> treatment_decision -> product_recommendation ->
    cart_decision -> human_confirmation -> add_to_cart.
    """
    from app.ai.graph.runner import run_pipeline

    scan_service = ScanService(db)
    try:
        scan = scan_service.get_scan(scan_id, current_user.id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    image_urls = [scan.image_url] if scan.image_url else []
    plant_species = ""
    scientific_name = ""
    if scan.identification_result:
        plant_species = scan.identification_result.common_name or ""
        scientific_name = scan.identification_result.scientific_name or ""

    initial_overrides = {}
    if plant_species:
        initial_overrides["plant_species"] = plant_species
    if scientific_name:
        initial_overrides["scientific_name"] = scientific_name

    final_state = await run_pipeline(
        user_id=str(current_user.id),
        plant_id=str(scan.plant_id),
        scan_id=str(scan.id),
        image_urls=image_urls,
        db=db,
        initial_overrides=initial_overrides,
    )

    return SuccessResponse(data=final_state)


