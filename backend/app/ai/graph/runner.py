"""
Runner utility for invoking and resuming the Plantify LangGraph workflow.
"""

import logging
from typing import Any, Optional
from sqlalchemy.orm import Session

from app.ai.graph.graph import plantify_graph
from app.ai.graph.state import PlantifyGraphState, create_initial_state

logger = logging.getLogger(__name__)


class PlantifyGraphRunner:
    """
    Executes and resumes the compiled LangGraph pipeline for plant scans.
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
        Execute the graph workflow until completion or an interrupt checkpoint.

        Args:
            user_id: ID of the user owning the scan
            plant_id: ID of the plant
            scan_id: ID of the scan record (used as thread_id for checkpointing)
            image_urls: List of image file paths or URLs
            initial_overrides: Optional pre-set state fields (e.g. known species)

        Returns:
            PlantifyGraphState at termination or interrupt.
        """
        state = create_initial_state(
            user_id=user_id,
            plant_id=plant_id,
            scan_id=scan_id,
            image_urls=image_urls or [],
        )

        if initial_overrides:
            state.update(initial_overrides)

        thread_id = scan_id or f"{user_id}_{plant_id}"
        config = {
            "configurable": {
                "thread_id": thread_id,
            }
        }
        if self.db:
            config["configurable"]["db"] = self.db

        logger.info(
            "Running PlantifyGraph for scan_id=%s, thread_id=%s with %d image(s)",
            scan_id, thread_id, len(state.get("image_urls", [])),
        )

        result_state = await self.graph.ainvoke(state, config=config)

        logger.info(
            "PlantifyGraph execution paused or finished for scan_id=%s. Errors: %d, Messages: %d",
            scan_id,
            len(result_state.get("errors", [])),
            len(result_state.get("messages", [])),
        )

        return result_state

    async def resume(
        self,
        scan_id: str,
        user_id: str = "",
        action: str = "approve",  # "approve" or "decline"
    ) -> PlantifyGraphState:
        """
        Resume an interrupted graph from the checkpoint after user confirmation.

        Args:
            scan_id: The scan ID / thread_id of the paused workflow
            user_id: The authenticated user's ID
            action: User's decision ('approve' or 'decline')

        Returns:
            Final PlantifyGraphState after running through add_to_cart -> END.
        """
        thread_id = scan_id
        config = {
            "configurable": {
                "thread_id": thread_id,
            }
        }
        if self.db:
            config["configurable"]["db"] = self.db

        confirmation_status = "approved" if action == "approve" else "declined"
        state_update = {
            "cart_confirmation": confirmation_status,
        }
        if action == "decline":
            state_update["cart_action"] = "skip"

        logger.info(
            "Resuming PlantifyGraph for thread_id=%s with confirmation=%s",
            thread_id, confirmation_status,
        )

        # Update state at the checkpoint
        await self.graph.aupdate_state(config, state_update, as_node="cart_decision")

        # Resume execution (passing None input continues from current state)
        result_state = await self.graph.ainvoke(None, config=config)

        logger.info(
            "PlantifyGraph resume finished for scan_id=%s",
            scan_id,
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

