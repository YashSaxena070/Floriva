"""
Application settings loaded from environment variables via Pydantic BaseSettings.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Central configuration for the Plantify backend."""

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/plantify"

    # ── JWT Authentication ────────────────────────────────────
    JWT_SECRET: str = "change-this-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days for persistent mobile app sessions

    # ── CORS ──────────────────────────────────────────────────
    CLIENT_URL: str = "http://localhost:8081"

    # ── Google OAuth2 (Server Verification & Secret) ──────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── External API Keys ─────────────────────────────────────
    PLANTNET_API_KEY: str = ""
    PERENUAL_API_KEY: str = ""
    WEATHER_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    # ── File Upload ───────────────────────────────────────────
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE_MB: int = 10

    # ── Future: Redis & Celery (async AI processing) ──────────
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    """Cached singleton for application settings."""
    return Settings()
