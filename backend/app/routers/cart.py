"""
Cart Router: endpoints for managing the saved recommendations cart
and approving AI product recommendations (human-in-the-loop resume).
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.cart import (
    CartResponse,
    CartItemResponse,
    AddToCartRequest,
    UpdateCartItemRequest,
    CartApprovalRequest,
)
from app.schemas.common import SuccessResponse
from app.services.cart_service import CartService
from app.ai.graph.runner import PlantifyGraphRunner

router = APIRouter(prefix="/api/cart", tags=["Cart"])


@router.get("", response_model=SuccessResponse)
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieve the current user's saved recommendations cart.
    Includes all items and external retailer buy links.
    """
    cart_service = CartService(db)
    cart = cart_service.get_cart(current_user.id)
    return SuccessResponse(data=cart.model_dump(mode="json"))


@router.post("/items", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
def add_cart_item(
    request: AddToCartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually add a product to the user's cart.
    """
    cart_service = CartService(db)
    try:
        item = cart_service.add_item(
            user_id=current_user.id,
            product_id=request.product_id,
            quantity=request.quantity,
            recommendation_reason=request.recommendation_reason,
            scan_id=request.scan_id,
        )
        return SuccessResponse(data=item.model_dump(mode="json"))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch("/items/{item_id}", response_model=SuccessResponse)
def update_cart_item(
    item_id: uuid.UUID,
    request: UpdateCartItemRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update quantity of a specific cart item.
    """
    cart_service = CartService(db)
    try:
        item = cart_service.update_item(
            user_id=current_user.id,
            item_id=item_id,
            quantity=request.quantity,
        )
        return SuccessResponse(data=item.model_dump(mode="json"))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/items/{item_id}", response_model=SuccessResponse)
def remove_cart_item(
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a product from the user's cart.
    """
    cart_service = CartService(db)
    try:
        removed = cart_service.remove_item(
            user_id=current_user.id,
            item_id=item_id,
        )
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cart item not found",
            )
        return SuccessResponse(data={"deleted": True, "item_id": str(item_id)})
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/approve/{scan_id}", response_model=SuccessResponse)
async def approve_cart_action(
    scan_id: str,
    approval: CartApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resume LangGraph after user approval or decline of the recommended product.

    - action='approve': Resumes graph, proceeds to add_to_cart, and returns cart item + external buy links.
    - action='decline': Resumes graph, skips cart addition, and completes workflow.
    """
    runner = PlantifyGraphRunner(db=db)
    try:
        result_state = await runner.resume(
            scan_id=scan_id,
            user_id=str(current_user.id),
            action=approval.action,
        )

        response_data = {
            "status": "completed",
            "action": approval.action,
            "cart_confirmation": result_state.get("cart_confirmation"),
            "cart_item_added": result_state.get("cart_item_added"),
            "buy_links": result_state.get("buy_links", []),
            "messages": result_state.get("messages", []),
        }

        return SuccessResponse(data=response_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resume graph workflow: {str(e)}",
        )
