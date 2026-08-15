"""
Global exception handlers for consistent error responses.
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application."""

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions with consistent error format."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "message": exc.detail,
                "errorCode": _status_to_error_code(exc.status_code),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        """Handle Pydantic validation errors."""
        errors = exc.errors()
        first_error = errors[0] if errors else {}
        field = " → ".join(str(loc) for loc in first_error.get("loc", []))
        message = first_error.get("msg", "Validation error")

        return JSONResponse(
            status_code=422,
            content={
                "success": False,
                "message": f"{field}: {message}" if field else message,
                "errorCode": "VALIDATION_ERROR",
            },
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        """Handle ValueError exceptions from services."""
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "message": str(exc),
                "errorCode": "BAD_REQUEST",
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Catch-all handler for unhandled exceptions."""
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "An unexpected error occurred",
                "errorCode": "INTERNAL_SERVER_ERROR",
            },
        )


def _status_to_error_code(status_code: int) -> str:
    """Map HTTP status codes to human-readable error codes."""
    mapping = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        422: "VALIDATION_ERROR",
        429: "TOO_MANY_REQUESTS",
        500: "INTERNAL_SERVER_ERROR",
    }
    return mapping.get(status_code, f"HTTP_{status_code}")
