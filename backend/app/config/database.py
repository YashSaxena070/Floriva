"""
SQLAlchemy database engine and session management.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config.settings import get_settings

settings = get_settings()

# psycopg3 uses "postgresql+psycopg://" dialect prefix
database_url = settings.DATABASE_URL
if database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

# Build engine kwargs — SQLite doesn't support pool_size/max_overflow
engine_kwargs = {
    "echo": False,
}
if database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_engine(database_url, **engine_kwargs)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session per request.
    Automatically closes the session when the request completes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
