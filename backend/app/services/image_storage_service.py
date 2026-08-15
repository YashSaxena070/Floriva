"""
Image storage abstraction with local filesystem implementation.

Designed so alternative providers (S3, Cloudinary, Supabase) can be
swapped in by implementing the ImageStorageProvider interface.
"""

import os
import uuid
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from fastapi import UploadFile, HTTPException, status

from app.config.settings import get_settings

settings = get_settings()

# Allowed MIME types and extensions for plant images
ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}


class ImageStorageProvider(ABC):
    """
    Abstract base class for image storage.
    Implement this to support different storage backends.
    """

    @abstractmethod
    def save(
        self, file: UploadFile, subfolder: str = ""
    ) -> str:
        """
        Save an uploaded file and return its URL/path.
        Must validate the file before saving.
        """
        ...

    @abstractmethod
    def delete(self, file_url: str) -> bool:
        """Delete a file from storage. Returns True if successful."""
        ...

    @abstractmethod
    def get_url(self, file_path: str) -> str:
        """Get the public URL for a stored file."""
        ...

    def validate_image(self, file: UploadFile) -> None:
        """
        Validate an uploaded image file.
        Raises HTTPException if validation fails.
        """
        # Check for empty upload
        if not file or not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file uploaded",
            )

        # Check file extension
        _, ext = os.path.splitext(file.filename)
        if ext.lower() not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file extension '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        # Check MIME type
        if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type '{file.content_type}'. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
            )

        # Check file size by reading content
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty",
            )

        if file_size > settings.max_file_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File too large. Maximum size: {settings.MAX_FILE_SIZE_MB}MB",
            )


class LocalStorageProvider(ImageStorageProvider):
    """
    Local filesystem storage for development.
    Stores files under the UPLOAD_DIR directory.
    """

    def __init__(self):
        self.base_dir = Path(settings.UPLOAD_DIR)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, file: UploadFile, subfolder: str = "") -> str:
        """Save an uploaded file to local filesystem."""
        self.validate_image(file)

        # Generate a unique filename
        _, ext = os.path.splitext(file.filename or "image.jpg")
        unique_name = f"{uuid.uuid4().hex}{ext.lower()}"

        # Create the target directory
        target_dir = self.base_dir / subfolder if subfolder else self.base_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        file_path = target_dir / unique_name

        # Write the file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return a relative URL path (served by FastAPI static files)
        relative_path = str(file_path).replace("\\", "/")
        return f"/{relative_path}"

    def delete(self, file_url: str) -> bool:
        """Delete a file from local filesystem."""
        # Strip leading slash to get the relative path
        file_path = Path(file_url.lstrip("/"))
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def get_url(self, file_path: str) -> str:
        """Get the URL for a locally stored file."""
        return file_path


# ── Future provider stubs ────────────────────────────────────────

# class S3StorageProvider(ImageStorageProvider):
#     """AWS S3 storage provider."""
#     def save(self, file, subfolder=""):  ...
#     def delete(self, file_url):          ...
#     def get_url(self, file_path):        ...

# class CloudinaryStorageProvider(ImageStorageProvider):
#     """Cloudinary storage provider."""
#     def save(self, file, subfolder=""):  ...
#     def delete(self, file_url):          ...
#     def get_url(self, file_path):        ...

# class SupabaseStorageProvider(ImageStorageProvider):
#     """Supabase Storage provider."""
#     def save(self, file, subfolder=""):  ...
#     def delete(self, file_url):          ...
#     def get_url(self, file_path):        ...


def get_image_storage() -> ImageStorageProvider:
    """
    Factory function to get the configured image storage provider.
    Currently returns LocalStorageProvider for development.
    Swap this to return a different provider for production.
    """
    return LocalStorageProvider()
