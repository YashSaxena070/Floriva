"""
Authentication service: registration, login, JWT token management.
"""

import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config.settings import get_settings
from app.models.user import User
from app.repositories.user_repository import UserRepository

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Business logic for authentication operations."""

    def __init__(self, db: Session):
        self.db = db
        self.user_repo = UserRepository(db)

    def hash_password(self, password: str) -> str:
        """Hash a plain-text password."""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a plain-text password against a hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, user_id: uuid.UUID) -> str:
        """Create a JWT access token for the given user."""
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        payload = {
            "sub": str(user_id),
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(
            payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM
        )

    @staticmethod
    def decode_token(token: str) -> dict:
        """Decode and validate a JWT token. Raises JWTError on failure."""
        return jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )

    def register(self, name: str, email: str, password: str) -> tuple[User, str]:
        """
        Register a new user. Returns (user, access_token).
        Raises ValueError if email is already taken.
        """
        if self.user_repo.email_exists(email):
            raise ValueError("An account with this email already exists")

        password_hash = self.hash_password(password)
        user = self.user_repo.create(
            name=name,
            email=email,
            password_hash=password_hash,
        )
        token = self.create_access_token(user.id)
        return user, token

    def login(self, email: str, password: str) -> tuple[User, str]:
        """
        Authenticate a user. Returns (user, access_token).
        Raises ValueError if credentials are invalid.
        """
        user = self.user_repo.get_by_email(email)
        if not user:
            raise ValueError("Invalid email or password")

        if not self.verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")

        token = self.create_access_token(user.id)
        return user, token

    def get_user_by_id(self, user_id: uuid.UUID) -> User:
        """
        Fetch a user by ID. Raises ValueError if not found.
        """
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        return user

    def authenticate_google_user(
        self,
        email: str,
        name: str,
        google_id: str | None = None,
    ) -> tuple[User, str]:
        """
        Authenticate or automatically create a user via Google OAuth2.
        Returns (user, access_token).
        """
        user = self.user_repo.get_by_email(email)
        if not user:
            # Create new user for first-time Google sign-in
            random_password = uuid.uuid4().hex + uuid.uuid4().hex
            password_hash = self.hash_password(random_password)
            user = self.user_repo.create(
                name=name or email.split("@")[0],
                email=email,
                password_hash=password_hash,
            )
        else:
            # Update name if changed
            if name and (not user.name or user.name == "User"):
                user.name = name
                self.db.commit()
                self.db.refresh(user)

        token = self.create_access_token(user.id)
        return user, token
