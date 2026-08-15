"""
Scan service: manages scan creation, image validation, status tracking,
and AI-powered plant identification.
Structured for future async AI job queuing and disease analysis.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.plant_scan import PlantScan, ScanStatus
from app.repositories.scan_repository import ScanRepository
from app.repositories.plant_repository import PlantRepository
from app.services.image_storage_service import get_image_storage
from app.ai.services.plant_identification_service import PlantIdentificationService
from app.ai.providers.plantnet_provider import PlantNetError

logger = logging.getLogger(__name__)


class ScanService:
    """Business logic for plant scan management."""

    def __init__(self, db: Session):
        self.db = db
        self.scan_repo = ScanRepository(db)
        self.plant_repo = PlantRepository(db)
        self.image_storage = get_image_storage()

    def create_scan(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        image: UploadFile,
    ) -> PlantScan:
        """
        Create a new scan for a plant:
        1. Verify plant ownership
        2. Validate the uploaded image
        3. Save the image to storage
        4. Create a PlantScan record with PENDING status
        5. Return the scan

        Future: Step 4.5 would queue an AI job via Celery/Redis.
        """
        # 1. Verify plant ownership
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        # 2. Validate the image (done inside storage service)
        # 3. Save the image
        image_url = self.image_storage.save(image, subfolder=f"scans/{plant_id}")

        # 4. Create the scan record
        scan = self.scan_repo.create(
            plant_id=plant_id,
            image_url=image_url,
            status=ScanStatus.PENDING,
        )

        # Also add the image to the plant's image gallery
        self.plant_repo.add_image(
            plant_id=plant_id,
            image_url=image_url,
            image_type="scan",
        )

        # Future: Queue AI job here
        # Example:
        # from app.ai.tasks import process_scan
        # process_scan.delay(str(scan.id))

        return scan

    async def identify_plant(
        self,
        plant_id: uuid.UUID,
        user_id: uuid.UUID,
        image: UploadFile,
    ) -> dict:
        """
        Full plant identification pipeline:
        1. Authenticate user (done by router via dependency)
        2. Verify plant ownership
        3. Validate uploaded image
        4. Save image to storage
        5. Create/update scan record (PROCESSING)
        6. Call Pl@ntNet via PlantIdentificationService
        7. Store identification result in IdentificationResult table
        8. Update Plant record with best-match data
        9. Mark scan as COMPLETED (or FAILED on error)
        10. Return structured identification response

        Returns:
            Dict with scan_id, plant identification, and alternatives.

        Raises:
            ValueError: Plant not found / not owned by user.
            PlantNetError: Pl@ntNet API failures (propagated to router).
        """
        # 2. Verify plant ownership, or auto-create if new plant ID
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            plant = self.plant_repo.create(
                plant_id=plant_id,
                user_id=user_id,
                name="Unidentified Plant",
            )

        # 3-4. Validate and save image
        image_url = self.image_storage.save(image, subfolder=f"scans/{plant_id}")

        # 5. Create scan record in PROCESSING state
        scan = self.scan_repo.create(
            plant_id=plant_id,
            image_url=image_url,
            status=ScanStatus.PROCESSING,
        )

        # Also add to plant's image gallery
        self.plant_repo.add_image(
            plant_id=plant_id,
            image_url=image_url,
            image_type="scan",
        )

        try:
            # 6. Call Pl@ntNet
            identification_service = PlantIdentificationService()

            # Resolve the on-disk path from the stored URL
            # image_url is like "/uploads/scans/{plantId}/{filename}"
            disk_path = image_url.lstrip("/")

            result = await identification_service.identify(disk_path)

            plant_data = result["plant"]

            # 7. Store identification result in the separate table
            self.scan_repo.add_identification_result(
                scan_id=scan.id,
                common_name=plant_data.get("name"),
                scientific_name=plant_data.get("scientificName"),
                family=plant_data.get("family"),
                genus=plant_data.get("genus"),
                confidence=plant_data.get("confidence"),
                common_names=plant_data.get("commonNames"),
                alternatives=result.get("alternatives"),
                raw_response=result.get("raw_response"),
                provider="plantnet",
            )

            # 8. Update the Plant record with best-match data
            update_data = {
                "name": plant_data.get("name") or plant.name,
                "scientific_name": plant_data.get("scientificName"),
                "identification_confidence": plant_data.get("confidence"),
                "image_url": image_url,
            }
            self.plant_repo.update(plant, update_data)

            # 9. Mark scan as COMPLETED
            self.scan_repo.update_status(
                scan,
                ScanStatus.COMPLETED,
                completed_at=datetime.now(timezone.utc),
            )

            # 10. Return structured response
            return {
                "scan_id": str(scan.id),
                "plant": plant_data,
                "alternatives": result.get("alternatives", []),
                "lowConfidence": result.get("lowConfidence", False),
            }

        except PlantNetError:
            # Mark scan as FAILED and re-raise for the router
            self.scan_repo.update_status(scan, ScanStatus.FAILED)
            raise

        except Exception as e:
            # Unexpected error — mark scan as FAILED
            logger.exception("Unexpected error during plant identification")
            self.scan_repo.update_status(scan, ScanStatus.FAILED)
            raise PlantNetError(
                f"Plant identification failed: {str(e)}", status_code=500
            )

    def get_scan(self, scan_id: uuid.UUID, user_id: uuid.UUID) -> PlantScan:
        """
        Get a scan by ID, verifying that the user owns the associated plant.
        """
        scan = self.scan_repo.get_by_id(scan_id)
        if not scan:
            raise ValueError("Scan not found")

        # Verify ownership through the plant relationship
        plant = self.plant_repo.get_by_id(scan.plant_id, user_id)
        if not plant:
            raise ValueError("Scan not found")

        return scan

    def get_scans_for_plant(
        self, plant_id: uuid.UUID, user_id: uuid.UUID
    ) -> list[PlantScan]:
        """
        Get all scans for a plant, verifying ownership.
        """
        plant = self.plant_repo.get_by_id(plant_id, user_id)
        if not plant:
            raise ValueError("Plant not found")

        return self.scan_repo.get_scans_for_plant(plant_id)

