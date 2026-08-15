"""
Database dependency re-export for cleaner imports.
"""

from app.config.database import get_db

__all__ = ["get_db"]
