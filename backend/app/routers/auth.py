"""
Authentication router: register, login, get current user.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import UserRegister, UserLogin, UserResponse, TokenResponse
from app.schemas.common import SuccessResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=SuccessResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account and return a JWT token."""
    auth_service = AuthService(db)

    try:
        user, token = auth_service.register(
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    return SuccessResponse(
        data=TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        ).model_dump()
    )


@router.post("/login", response_model=SuccessResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT token."""
    auth_service = AuthService(db)

    try:
        user, token = auth_service.login(
            email=payload.email,
            password=payload.password,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
        )

    return SuccessResponse(
        data=TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user),
        ).model_dump()
    )


@router.get("/me", response_model=SuccessResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return SuccessResponse(
        data=UserResponse.model_validate(current_user).model_dump()
    )
