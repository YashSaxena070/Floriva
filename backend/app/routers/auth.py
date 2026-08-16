"""
Authentication router: register, login, get current user.
"""

import json
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    GoogleAuthPayload,
    UserResponse,
    TokenResponse,
)
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


@router.post("/google", response_model=SuccessResponse)
def google_auth(payload: GoogleAuthPayload, db: Session = Depends(get_db)):
    """Authenticate or register a user using Google OAuth2 credentials."""
    auth_service = AuthService(db)

    email = payload.email
    name = payload.name

    # If token is provided and email isn't provided directly, verify token with Google
    if payload.token and not email:
        try:
            # 1. Try Google ID token validation
            req = urllib.request.Request(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={payload.token}"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                info = json.loads(response.read().decode())
                email = info.get("email")
                name = info.get("name", name)
        except Exception:
            try:
                # 2. Try Google Access token validation
                req = urllib.request.Request(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {payload.token}"}
                )
                with urllib.request.urlopen(req, timeout=5) as response:
                    info = json.loads(response.read().decode())
                    email = info.get("email")
                    name = info.get("name", name)
            except Exception:
                pass

    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication requires a valid email or verified Google token.",
        )

    user, token = auth_service.authenticate_google_user(
        email=email,
        name=name or email.split("@")[0],
        google_id=payload.google_id,
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
