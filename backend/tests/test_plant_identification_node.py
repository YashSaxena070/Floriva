"""
Unit tests for Part 2: Plant Identification Node and LangGraph Routing.
"""

import os
import uuid
import pytest
from PIL import Image

from app.services.image_storage_service import validate_image_on_disk
from app.ai.graph.state import create_initial_state
from app.ai.graph.nodes import (
    image_validation_node,
    plant_identification_node,
    request_better_image_node,
)
from app.ai.graph.graph import (
    create_plantify_graph,
    check_identification_confidence,
    check_image_validation,
)


@pytest.fixture
def sample_test_image(tmp_path):
    """Creates a valid JPEG image file for testing."""
    img_path = tmp_path / "valid_leaf.jpg"
    img = Image.new("RGB", (200, 200), color=(34, 139, 34))
    img.save(img_path, format="JPEG")
    return str(img_path)


@pytest.fixture
def corrupted_test_image(tmp_path):
    """Creates a corrupted file with .jpg extension."""
    img_path = tmp_path / "corrupted.jpg"
    img_path.write_bytes(b"NOT_A_VALID_IMAGE_CONTENT")
    return str(img_path)


def test_validate_image_on_disk_success(sample_test_image):
    """Verify that a valid image passes disk validation."""
    meta = validate_image_on_disk(sample_test_image)
    assert meta["valid"] is True
    assert meta["width"] == 200
    assert meta["height"] == 200
    assert meta["format"] == "JPEG"


def test_validate_image_on_disk_corrupted(corrupted_test_image):
    """Verify that a corrupted image fails validation."""
    with pytest.raises(ValueError, match="corrupted or not a valid image format"):
        validate_image_on_disk(corrupted_test_image)


def test_validate_image_on_disk_nonexistent():
    """Verify that a non-existent file fails validation."""
    with pytest.raises(ValueError, match="does not exist"):
        validate_image_on_disk("non_existent_file_12345.jpg")


@pytest.mark.asyncio
async def test_image_validation_node_valid(sample_test_image):
    """Verify image_validation_node with valid image."""
    state = create_initial_state(image_urls=[sample_test_image])
    result = await image_validation_node(state)

    assert result["image_quality_passed"] is True
    assert result["requires_better_image"] is False
    assert len(result["image_urls"]) == 1


@pytest.mark.asyncio
async def test_image_validation_node_invalid(corrupted_test_image):
    """Verify image_validation_node with invalid image flags better image required."""
    state = create_initial_state(image_urls=[corrupted_test_image])
    result = await image_validation_node(state)

    assert result["image_quality_passed"] is False
    assert result["requires_better_image"] is True
    assert len(result["errors"]) > 0


def test_confidence_routing_decisions():
    """Verify routing functions for high and low confidence."""
    # High confidence -> health_analysis
    high_state = create_initial_state()
    high_state["low_confidence"] = False
    high_state["requires_better_image"] = False
    assert check_identification_confidence(high_state) == "health_analysis"

    # Low confidence -> request_better_image
    low_state = create_initial_state()
    low_state["low_confidence"] = True
    low_state["requires_better_image"] = True
    assert check_identification_confidence(low_state) == "request_better_image"

    # Image validation failure -> request_better_image
    bad_img_state = create_initial_state()
    bad_img_state["image_quality_passed"] = False
    bad_img_state["requires_better_image"] = True
    assert check_image_validation(bad_img_state) == "request_better_image"


@pytest.mark.asyncio
async def test_request_better_image_node():
    """Verify request_better_image_node produces clear user guidance."""
    state = create_initial_state()
    state["identification_confidence"] = 0.15
    state["plant_species"] = "Uncertain Fern"
    state["alternative_species"] = [{"name": "Boston Fern"}, {"name": "Maidenhair Fern"}]

    result = await request_better_image_node(state)
    assert result["requires_better_image"] is True
    assert result["low_confidence"] is True
    assert any("Boston Fern" in msg for msg in result["messages"])
