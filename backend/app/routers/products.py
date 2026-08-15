"""
Product router: endpoints for product catalog browsing and
AI-powered product recommendations.

Catalog endpoints (GET) are public — no auth required.
Recommendation endpoint (POST) requires authentication.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.schemas.product import (
    CategoryResponse,
    ProductResponse,
    ProductDetailResponse,
)
from app.services.product_service import ProductService

router = APIRouter(tags=["Products"])


# ── Catalog Endpoints (public) ──────────────────────────────────


@router.get(
    "/api/products/categories",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def list_categories(db: Session = Depends(get_db)):
    """
    List all product categories.

    Response:
    {
        "success": true,
        "data": [
            {"id": "uuid", "name": "Fungicide", "slug": "fungicide", "description": "..."},
            ...
        ]
    }
    """
    service = ProductService(db)
    categories = service.list_categories()
    return SuccessResponse(
        data=[
            CategoryResponse.model_validate(c).model_dump(mode="json")
            for c in categories
        ]
    )


@router.get(
    "/api/products",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def list_products(
    category_id: Optional[uuid.UUID] = Query(None, description="Filter by category ID"),
    db: Session = Depends(get_db),
):
    """
    List all active products, optionally filtered by category.

    Query params:
        ?category_id=uuid  — Filter by category

    Response:
    {
        "success": true,
        "data": [
            {
                "id": "uuid",
                "name": "Neem Oil Spray 500ml",
                "brand": "Garden Safe",
                "price": 9.99,
                "category_name": "Pest Control",
                ...
            },
            ...
        ]
    }
    """
    service = ProductService(db)
    products = service.list_products(category_id=category_id)
    return SuccessResponse(
        data=[ProductResponse.from_db(p).model_dump(mode="json") for p in products]
    )


@router.get(
    "/api/products/{product_id}",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def get_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """
    Get detailed product information including usage instructions
    and compatibility data.
    """
    service = ProductService(db)
    try:
        product = service.get_product(product_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    return SuccessResponse(
        data=ProductDetailResponse.from_db(product).model_dump(mode="json")
    )


# ── Recommendation Endpoint (requires auth) ─────────────────────


@router.post(
    "/api/scans/{scan_id}/recommend-products",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
def recommend_products(
    scan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Run the product recommendation pipeline for a scan.

    Requires:
    - Scan must exist and be owned by the authenticated user
    - Scan must have a CareRecommendation (run POST /analyze first)

    Pipeline:
    1. Load scan + CareRecommendation (AI treatment requirement)
    2. Map treatment → product categories
    3. Query real products from the database
    4. Filter by compatibility (species + problem)
    5. Filter by availability (in stock + active)
    6. Score and rank by relevance
    7. Return best_match, budget_option, premium_option

    IMPORTANT: The LLM NEVER invents products. All products come
    from the database. If no suitable product exists, returns
    an empty array with a message.

    Response:
    {
        "success": true,
        "data": {
            "recommendations": [
                {
                    "product": {
                        "id": "uuid",
                        "name": "Bonide Copper Fungicide 16oz",
                        "brand": "Bonide",
                        "price": 12.99,
                        ...
                    },
                    "match_type": "best_match",
                    "relevance_score": 0.92,
                    "reason": "Top recommendation for fungal disease..."
                },
                ...
            ],
            "treatment_context": {
                "problem_category": "fungal_disease",
                "product_category": "fungicide",
                "severity": "medium"
            },
            "message": null
        }
    }

    When no products match:
    {
        "success": true,
        "data": {
            "recommendations": [],
            "treatment_context": { ... },
            "message": "No suitable product is currently available."
        }
    }
    """
    service = ProductService(db)
    try:
        result = service.recommend_for_scan(
            scan_id=scan_id,
            user_id=current_user.id,
        )
    except ValueError as e:
        error_msg = str(e)
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

    return SuccessResponse(data=result.model_dump())
