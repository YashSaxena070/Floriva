"""
Unit tests for Part 3: Health & Disease Analysis Node and Structured Output.
"""

import uuid
import pytest
from pydantic import ValidationError
from unittest.mock import AsyncMock, patch

from app.ai.schemas.analysis import PlantHealthAnalysisOutput, PlantHealthResult
from app.ai.graph.state import create_initial_state
from app.ai.graph.nodes import health_analysis_node
from app.ai.graph.graph import check_health_analysis_confidence


def test_plant_health_analysis_output_schema_valid():
    """Verify schema acceptance of healthy and diseased structured data."""
    # Healthy case
    healthy = PlantHealthAnalysisOutput.model_validate({
        "health_status": "healthy",
        "issue": "No issues detected",
        "confidence": 0.95,
        "severity": "none",
        "symptoms": [],
        "possible_causes": [],
    })
    assert healthy.health_status == "healthy"
    assert healthy.severity == "none"

    # Diseased case
    diseased = PlantHealthAnalysisOutput.model_validate({
        "health_status": "diseased",
        "issue": "Powdery Mildew",
        "confidence": 0.88,
        "severity": "medium",
        "symptoms": ["White powdery spots on upper leaf surfaces", "Curling leaves"],
        "possible_causes": ["Fungal pathogen Podosphaera pannosa", "High humidity with poor airflow"],
    })
    assert diseased.health_status == "diseased"
    assert diseased.severity == "medium"
    assert len(diseased.symptoms) == 2


def test_plant_health_analysis_output_schema_invalid():
    """Verify that arbitrary invalid values are rejected by the Pydantic firewall."""
    with pytest.raises(ValidationError):
        PlantHealthAnalysisOutput.model_validate({
            "health_status": "INVALID_STATUS",
            "confidence": 1.5,  # out of bounds
        })


def test_health_confidence_routing():
    """Verify routing decisions based on health analysis state."""
    # High confidence healthy plant -> plant_analysis
    healthy_state = create_initial_state()
    healthy_state["health_status"] = "healthy"
    healthy_state["disease_confidence"] = 0.92
    healthy_state["requires_better_image"] = False
    healthy_state["low_confidence"] = False
    assert check_health_analysis_confidence(healthy_state) == "plant_analysis"

    # High confidence diseased plant -> plant_analysis
    diseased_state = create_initial_state()
    diseased_state["health_status"] = "diseased"
    diseased_state["disease"] = "Black Spot"
    diseased_state["disease_confidence"] = 0.85
    diseased_state["requires_better_image"] = False
    diseased_state["low_confidence"] = False
    assert check_health_analysis_confidence(diseased_state) == "plant_analysis"

    # Low confidence health diagnosis -> request_better_image
    low_conf_state = create_initial_state()
    low_conf_state["health_status"] = "warning"
    low_conf_state["disease_confidence"] = 0.25
    low_conf_state["low_confidence"] = True
    assert check_health_analysis_confidence(low_conf_state) == "request_better_image"


@pytest.mark.asyncio
async def test_health_analysis_node_mocked():
    """Verify health_analysis_node successfully calls provider and populates state."""
    mock_health_data = {
        "healthStatus": "diseased",
        "issue": "Leaf Spot",
        "confidence": 0.89,
        "severity": "medium",
        "symptoms": ["Brown spots with yellow halos"],
        "possibleCauses": ["Cercospora fungal infection"],
        "lowConfidence": False,
    }

    with patch("app.ai.services.health_analysis_service.HealthAnalysisService.analyze", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = mock_health_data

        state = create_initial_state(image_urls=["uploads/scans/test/leaf.jpg"])
        state["plant_species"] = "Monstera Deliciosa"

        result = await health_analysis_node(state)

        assert result["health_status"] == "diseased"
        assert result["disease"] == "Leaf Spot"
        assert result["disease_confidence"] == 0.89
        assert result["severity"] == "medium"
        assert len(result["symptoms"]) == 1
        assert len(result["possible_causes"]) == 1
        assert result["low_confidence"] is False
        assert result["requires_better_image"] is False
