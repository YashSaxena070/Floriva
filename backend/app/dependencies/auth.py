"""
Authentication dependency for protected endpoints.
Extracts and validates JWT from the Authorization header.
"""

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.models.user import User
from app.services.auth_service import AuthService

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency that extracts the JWT from the Authorization header,
    validates it, and returns the authenticated User model instance.

    Usage in endpoints:
        @router.get("/protected")
        def protected(user: User = Depends(get_current_user)):
            ...
    """
    token = credentials.credentials

    try:
        payload = AuthService.decode_token(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
            )
        user_id = uuid.UUID(user_id_str)
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
        )

    auth_service = AuthService(db)
    try:
        user = auth_service.get_user_by_id(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user
