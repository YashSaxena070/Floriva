"""
Data access layer for User model.
"""

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:
    """Repository for User CRUD operations."""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        """Fetch a user by their primary key."""
        return self.db.query(User).filter(User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[User]:
        """Fetch a user by their email address."""
        return self.db.query(User).filter(User.email == email).first()

    def create(self, name: str, email: str, password_hash: str) -> User:
        """Create a new user record."""
        user = User(
            name=name,
            email=email,
            password_hash=password_hash,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def email_exists(self, email: str) -> bool:
        """Check if an email is already registered."""
        return self.db.query(User).filter(User.email == email).count() > 0
