"""
Authentication schemas for registration, login, and user responses.
"""

import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class UserRegister(BaseModel):
    """Schema for user registration."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    """Schema for user login."""
    email: EmailStr
    password: str


class GoogleAuthPayload(BaseModel):
    """Schema for Google OAuth token authentication."""
    token: str | None = None
    email: EmailStr | None = None
    name: str | None = None
    google_id: str | None = None


class UserResponse(BaseModel):
    """Schema for user data in API responses."""
    id: uuid.UUID
    name: str
    email: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
