"""
Common response schemas for consistent API responses.
"""

from typing import Any, Optional
from pydantic import BaseModel


class SuccessResponse(BaseModel):
    """Standard success response wrapper."""
    success: bool = True
    data: Any = None


class ErrorResponse(BaseModel):
    """Standard error response wrapper."""
    success: bool = False
    message: str
    errorCode: str


class PaginatedResponse(BaseModel):
    """Paginated response wrapper for list endpoints."""
    success: bool = True
    data: list[Any] = []
    total: int = 0
    page: int = 1
    per_page: int = 20
