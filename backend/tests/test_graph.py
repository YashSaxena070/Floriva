"""
Unit tests for the Plantify LangGraph workflow and state.
"""

import pytest
from app.ai.graph.state import PlantifyGraphState, create_initial_state
from app.ai.graph.graph import plantify_graph, create_plantify_graph
from app.ai.graph.runner import PlantifyGraphRunner


def test_initial_state_creation():
    """Verify that create_initial_state returns complete defaults with no DB objects."""
    state = create_initial_state(
        user_id="user-1",
        plant_id="plant-1",
        scan_id="scan-1",
        image_urls=["uploads/scans/plant-1/leaf.jpg"],
    )

    assert state["user_id"] == "user-1"
    assert state["plant_id"] == "plant-1"
    assert state["scan_id"] == "scan-1"
    assert len(state["image_urls"]) == 1
    assert state["health_status"] == "unknown"
    assert state["problem_category"] == "healthy"
    assert state["cart_action"] == "none"
    assert isinstance(state["messages"], list)
    assert isinstance(state["errors"], list)


def test_graph_nodes_and_edges():
    """Verify that all 9 required nodes exist in the graph."""
    graph = create_plantify_graph()
    compiled = graph.compile()

    expected_nodes = {
        "image_validation",
        "plant_identification",
        "health_analysis",
        "plant_analysis",
        "treatment_decision",
        "product_recommendation",
        "cart_decision",
        "human_confirmation",
        "add_to_cart",
    }

    actual_nodes = set(compiled.nodes.keys())
    assert expected_nodes.issubset(actual_nodes)


@pytest.mark.asyncio
async def test_graph_execution_with_empty_images():
    """Verify graceful handling when running without images."""
    runner = PlantifyGraphRunner()
    result = await runner.run(
        user_id="user-123",
        plant_id="plant-456",
        scan_id="scan-789",
        image_urls=[],
    )

    assert len(result.get("errors", [])) > 0
    assert result.get("cart_action") == "none"
    assert len(result.get("messages", [])) > 0
