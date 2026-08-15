"""
Plantify Backend — FastAPI Application Entry Point

A scalable Python backend designed to support the Plantify mobile app's
AI/ML pipeline for plant identification, health analysis, and care recommendations.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config.settings import get_settings
from app.middleware.error_handler import register_exception_handlers
from app.routers import auth, plants, scans

settings = get_settings()


def create_app() -> FastAPI:
    """Application factory for the Plantify backend."""

    app = FastAPI(
        title="Plantify API",
        description=(
            "Backend API for the Plantify mobile application. "
            "Provides authentication, plant management, image scanning, "
            "and a foundation for AI-powered plant analysis."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──────────────────────────────────────────────────
    origins = [
        settings.CLIENT_URL,
        "http://localhost:8081",
        "http://localhost:19006",
        "http://localhost:19000",
        "exp://localhost:8081",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Exception Handlers ────────────────────────────────────
    register_exception_handlers(app)

    # ── Static Files (uploaded images) ────────────────────────
    uploads_dir = Path(settings.UPLOAD_DIR)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads",
        StaticFiles(directory=str(uploads_dir)),
        name="uploads",
    )

    # ── Routers ───────────────────────────────────────────────
    app.include_router(auth.router)
    app.include_router(plants.router)
    app.include_router(scans.router)

    # ── Health Check ──────────────────────────────────────────
    @app.get("/api/health", tags=["Health"])
    def health_check():
        return {
            "success": True,
            "data": {
                "status": "healthy",
                "version": "1.0.0",
                "service": "Plantify API",
            },
        }

    return app


# Create the application instance
app = create_app()
