"""
Runner utility for invoking the Plantify LangGraph workflow.
"""

import logging
from typing import Any, Optional
from sqlalchemy.orm import Session

from app.ai.graph.graph import plantify_graph
from app.ai.graph.state import PlantifyGraphState, create_initial_state

logger = logging.getLogger(__name__)


class PlantifyGraphRunner:
    """
    Executes the compiled LangGraph pipeline for plant scans.
    """

    def __init__(self, db: Optional[Session] = None):
        self.db = db
        self.graph = plantify_graph

    async def run(
        self,
        user_id: str = "",
        plant_id: str = "",
        scan_id: str = "",
        image_urls: Optional[list[str]] = None,
        initial_overrides: Optional[dict[str, Any]] = None,
    ) -> PlantifyGraphState:
        """
        Execute the end-to-end graph workflow.

        Args:
            user_id: ID of the user owning the scan
            plant_id: ID of the plant
            scan_id: ID of the scan record
            image_urls: List of image file paths or URLs
            initial_overrides: Optional pre-set state fields (e.g. known species)

        Returns:
            Final PlantifyGraphState after full pipeline execution.
        """
        state = create_initial_state(
            user_id=user_id,
            plant_id=plant_id,
            scan_id=scan_id,
            image_urls=image_urls or [],
        )

        if initial_overrides:
            state.update(initial_overrides)

        config = {}
        if self.db:
            config["configurable"] = {"db": self.db}

        logger.info(
            "Running PlantifyGraph for scan_id=%s, plant_id=%s with %d image(s)",
            scan_id, plant_id, len(state.get("image_urls", [])),
        )

        result_state = await self.graph.ainvoke(state, config=config)

        logger.info(
            "PlantifyGraph execution finished for scan_id=%s. Errors: %d, Messages: %d",
            scan_id,
            len(result_state.get("errors", [])),
            len(result_state.get("messages", [])),
        )

        return result_state


async def run_pipeline(
    user_id: str = "",
    plant_id: str = "",
    scan_id: str = "",
    image_urls: Optional[list[str]] = None,
    db: Optional[Session] = None,
    initial_overrides: Optional[dict[str, Any]] = None,
) -> PlantifyGraphState:
    """Convenience helper to run the pipeline."""
    runner = PlantifyGraphRunner(db=db)
    return await runner.run(
        user_id=user_id,
        plant_id=plant_id,
        scan_id=scan_id,
        image_urls=image_urls,
        initial_overrides=initial_overrides,
    )
