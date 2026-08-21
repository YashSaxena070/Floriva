"""
Unit and integration tests for Part 7:
- load_plant_context node (Plant Memory)
- Plantify AI Chat LangGraph
- LangChain plant tools (get_plant_history, get_latest_scan, get_plant_identity, search_plant_knowledge)
- POST /api/ai/chat endpoint
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.plant import Plant
from app.models.plant_scan import PlantScan, ScanStatus
from app.models.health_analysis import HealthAnalysis
from app.models.identification_result import IdentificationResult
from app.models.care_recommendation import CareRecommendation
from app.models.plant_image import PlantImage
from app.models.cart import Cart, CartItem
from app.models.product import Product, Category
from app.ai.graph.nodes import load_plant_context_node
from app.ai.graph.state import create_initial_state
from app.ai.graph.chat_graph import (
    PlantifyChatState,
    create_initial_chat_state,
    create_chat_graph,
    PlantifyChatRunner,
)
from app.ai.tools.plant_tools import create_plant_tools


# ── Fixtures for Plant Memory Testing ─────────────────────────────


@pytest.fixture
def populated_plant_db(db_session: Session, registered_user: dict):
    """Seed database with a complete plant history."""
    user_id = uuid.UUID(registered_user["user"]["id"])

    # 1. Create plant
    plant = Plant(
        user_id=user_id,
        name="Monstera Deliciosa",
        scientific_name="Monstera deliciosa",
        identification_confidence=0.96,
        image_url="uploads/plants/monstera.jpg",
    )
    db_session.add(plant)
    db_session.commit()
    db_session.refresh(plant)

    # 2. Create Category and Product
    cat = Category(name="Fungicide", slug="fungicide", description="Anti-fungal treatments")
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)

    product = Product(
        name="Organic Neem Oil Fungicide",
        brand="PlantCare Co",
        category_id=cat.id,
        price=349.00,
        stock=50,
        active=True,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    # 3. Create Scan 1 (older, healthy)
    scan1 = PlantScan(
        plant_id=plant.id,
        image_url="uploads/scans/monstera_scan1.jpg",
        status=ScanStatus.COMPLETED,
    )
    db_session.add(scan1)
    db_session.commit()
    db_session.refresh(scan1)

    id_result1 = IdentificationResult(
        scan_id=scan1.id,
        common_name="Monstera Deliciosa",
        scientific_name="Monstera deliciosa",
        confidence=0.96,
        provider="plantnet",
    )
    health1 = HealthAnalysis(
        scan_id=scan1.id,
        health_status="healthy",
        issue="No issues detected",
        confidence=0.92,
        severity="none",
        symptoms=[],
        possible_causes=[],
    )
    care1 = CareRecommendation(
        scan_id=scan1.id,
        summary="Maintain bright indirect sunlight and regular watering.",
        care_data={"watering": "Weekly", "sunlight": "Bright indirect"},
        problem_detected=False,
        problem_category="healthy",
        treatment_data={"required": False},
        provider="groq",
    )
    db_session.add_all([id_result1, health1, care1])

    # 4. Create Scan 2 (newer, diseased)
    scan2 = PlantScan(
        plant_id=plant.id,
        image_url="uploads/scans/monstera_scan2.jpg",
        status=ScanStatus.COMPLETED,
    )
    db_session.add(scan2)
    db_session.commit()
    db_session.refresh(scan2)

    health2 = HealthAnalysis(
        scan_id=scan2.id,
        health_status="diseased",
        issue="Powdery Mildew",
        confidence=0.88,
        severity="medium",
        symptoms=["White powdery coating", "Yellowing leaf margins"],
        possible_causes=["High humidity with low airflow"],
    )
    care2 = CareRecommendation(
        scan_id=scan2.id,
        summary="Apply fungicide spray and isolate from other plants.",
        care_data={"watering": "Reduce watering", "sunlight": "Bright indirect"},
        problem_detected=True,
        problem_category="fungal_disease",
        problem_severity="medium",
        treatment_data={
            "required": True,
            "product_category": "fungicide",
            "recommended_actions": ["Spray leaves thoroughly every 7 days"],
            "frequency": "Weekly",
            "estimated_duration": "2-3 weeks",
        },
        provider="groq",
    )
    db_session.add_all([health2, care2])

    # 5. Create Cart & CartItem linked to scan2
    cart = Cart(user_id=user_id)
    db_session.add(cart)
    db_session.commit()
    db_session.refresh(cart)

    cart_item = CartItem(
        cart_id=cart.id,
        product_id=product.id,
        quantity=1,
        price_at_addition=349.00,
        recommendation_reason="Recommended for Powdery Mildew",
        scan_id=scan2.id,
    )
    db_session.add(cart_item)

    # 6. Add Plant Image
    plant_img = PlantImage(
        plant_id=plant.id,
        image_url="uploads/plants/monstera_detail.jpg",
        image_type="detail",
    )
    db_session.add(plant_img)
    db_session.commit()

    return {
        "user_id": user_id,
        "plant_id": plant.id,
        "product_id": product.id,
        "scan1_id": scan1.id,
        "scan2_id": scan2.id,
    }


# ── 1. Load Plant Context Node Tests ──────────────────────────────


@pytest.mark.asyncio
async def test_load_plant_context_node_no_plant_id():
    """Verify load_plant_context gracefully handles missing plant_id."""
    state = create_initial_state(user_id="user-1")
    result = await load_plant_context_node(state)

    assert "messages" in result
    assert "No plant ID provided" in result["messages"][0]


@pytest.mark.asyncio
async def test_load_plant_context_node_populated(db_session: Session, populated_plant_db: dict):
    """Verify load_plant_context populates complete plant history and summaries."""
    plant_id = str(populated_plant_db["plant_id"])
    state = create_initial_state(
        user_id=str(populated_plant_db["user_id"]),
        plant_id=plant_id,
    )

    config = {"configurable": {"db": db_session}}
    result = await load_plant_context_node(state, config=config)

    assert result["plant_name"] == "Monstera Deliciosa"
    assert result["plant_scientific_name"] == "Monstera deliciosa"
    assert result["plant_identification_confidence"] == 0.96

    # Scan history
    assert len(result["scan_history"]) == 2

    # Health summary
    health_summary = result["health_summary"]
    assert health_summary["total_health_checks"] == 2
    assert "status_distribution" in health_summary
    assert health_summary["status_distribution"].get("diseased") == 1
    assert health_summary["status_distribution"].get("healthy") == 1

    # Treatment summary
    treatment_summary = result["treatment_summary"]
    assert treatment_summary["total_treatments"] == 1
    assert "fungicide" in treatment_summary["product_categories_recommended"]

    # Cart history
    assert len(result["cart_history"]) == 1
    assert result["cart_history"][0]["product_name"] == "Organic Neem Oil Fungicide"

    # Images
    assert len(result["plant_images"]) == 1


# ── 2. LangChain Plant Tools Tests ────────────────────────────────


def test_plant_tools_get_plant_history(db_session: Session, populated_plant_db: dict):
    """Verify get_plant_history tool returns formatted plant context."""
    tools = create_plant_tools(db_session)
    tools_dict = {t.name: t for t in tools}
    assert "get_plant_history" in tools_dict

    plant_id = str(populated_plant_db["plant_id"])
    history_json = tools_dict["get_plant_history"].invoke({
        "plant_id": plant_id,
        "include_scans": True,
        "include_health": True,
        "include_treatments": True,
        "include_cart_items": True,
    })

    data = json.loads(history_json)
    assert "plant" in data
    assert data["plant"]["name"] == "Monstera Deliciosa"
    assert len(data["scans"]) == 2
    assert data["health_summary"]["total_health_checks"] == 2
    assert data["treatment_summary"]["total_treatments"] == 1
    assert len(data["cart_items"]) == 1


def test_plant_tools_get_latest_scan(db_session: Session, populated_plant_db: dict):
    """Verify get_latest_scan tool returns the newest scan with full details."""
    tools = create_plant_tools(db_session)
    tools_dict = {t.name: t for t in tools}
    assert "get_latest_scan" in tools_dict

    plant_id = str(populated_plant_db["plant_id"])
    scan_json = tools_dict["get_latest_scan"].invoke({"plant_id": plant_id, "include_full": True})

    data = json.loads(scan_json)
    assert "scan" in data
    scan_data = data["scan"]
    assert scan_data["scan_id"] == str(populated_plant_db["scan2_id"])
    assert len(scan_data["health_analyses"]) > 0
    assert scan_data["health_analyses"][0]["issue"] == "Powdery Mildew"


def test_plant_tools_get_plant_identity(db_session: Session, populated_plant_db: dict):
    """Verify get_plant_identity tool returns plant identification."""
    tools = create_plant_tools(db_session)
    tools_dict = {t.name: t for t in tools}

    plant_id = str(populated_plant_db["plant_id"])
    identity_json = tools_dict["get_plant_identity"].invoke({"plant_id": plant_id})

    data = json.loads(identity_json)
    assert "plant" in data
    assert data["plant"]["name"] == "Monstera Deliciosa"
    assert data["plant"]["scientific_name"] == "Monstera deliciosa"


def test_plant_tools_search_plant_knowledge(db_session: Session):
    """Verify search_plant_knowledge tool grounds query in knowledge base."""
    tools = create_plant_tools(db_session)
    tools_dict = {t.name: t for t in tools}

    # Search for Monstera care baseline
    result_json = tools_dict["search_plant_knowledge"].invoke({
        "species": "Monstera Deliciosa",
        "issue": "Powdery Mildew",
        "problem_category": "fungal_disease",
    })

    data = json.loads(result_json)
    assert data["care_baseline"] is not None
    assert "watering" in data["care_baseline"]
    assert len(data["treatment_protocols"]) > 0
    assert data["treatment_protocols"][0]["category"] == "fungal_disease"


def test_plant_tools_invalid_plant_id(db_session: Session):
    """Verify tools return error JSON on invalid plant IDs."""
    tools = create_plant_tools(db_session)
    tools_dict = {t.name: t for t in tools}

    res = json.loads(tools_dict["get_plant_history"].invoke({"plant_id": "not-a-uuid"}))
    assert "error" in res

    res2 = json.loads(tools_dict["get_latest_scan"].invoke({"plant_id": "not-a-uuid"}))
    assert "error" in res2

    res3 = json.loads(tools_dict["get_plant_identity"].invoke({"plant_id": "not-a-uuid"}))
    assert "error" in res3


# ── 3. Chat Graph & Runner Tests ──────────────────────────────────


def test_create_initial_chat_state():
    """Verify initial chat state creation."""
    state = create_initial_chat_state(
        user_id="user-123",
        plant_id="plant-456",
        question="How often should I water my snake plant?",
    )

    assert state["user_id"] == "user-123"
    assert state["plant_id"] == "plant-456"
    assert state["current_question"] == "How often should I water my snake plant?"
    assert len(state["messages"]) == 1
    assert state["messages"][0].content == "How often should I water my snake plant?"


def test_chat_graph_compilation():
    """Verify that create_chat_graph compiles with proper nodes and edges."""
    workflow = create_chat_graph()
    compiled = workflow.compile()

    assert "chat_agent" in compiled.nodes


@pytest.mark.asyncio
async def test_chat_runner_mock_llm(db_session: Session, populated_plant_db: dict):
    """Verify PlantifyChatRunner processes question and returns AI response."""
    plant_id = str(populated_plant_db["plant_id"])
    user_id = str(populated_plant_db["user_id"])

    runner = PlantifyChatRunner(db=db_session)

    # Mock the graph ainvoke
    mock_ai_message = MagicMock()
    mock_ai_message.type = "ai"
    mock_ai_message.content = "Your Monstera is recovering from Powdery Mildew. Continue with neem oil spray."

    with patch.object(runner.graph, "ainvoke", new_callable=AsyncMock) as mock_invoke:
        mock_invoke.return_value = {
            "user_id": user_id,
            "plant_id": plant_id,
            "messages": [mock_ai_message],
            "trace_messages": ["Chat agent responded directly."],
            "errors": [],
        }

        result = await runner.run(
            user_id=user_id,
            plant_id=plant_id,
            question="How is my Monstera doing?",
        )

        assert len(result["messages"]) == 1
        assert "Monstera is recovering" in result["messages"][0].content


# ── 4. POST /api/ai/chat Endpoint Tests ────────────────────────────


class TestAIChatEndpoint:
    """Tests for POST /api/ai/chat endpoint."""

    def test_ai_chat_unauthenticated(self, client: TestClient, populated_plant_db: dict):
        """Unauthenticated request must return 403 / 401."""
        response = client.post(
            "/api/ai/chat",
            json={
                "plant_id": str(populated_plant_db["plant_id"]),
                "question": "How do I care for this plant?",
            },
        )
        assert response.status_code == 403

    def test_ai_chat_invalid_plant_id_format(
        self, client: TestClient, auth_headers: dict
    ):
        """Invalid plant_id format returns 400 Bad Request."""
        response = client.post(
            "/api/ai/chat",
            json={
                "plant_id": "not-a-valid-uuid",
                "question": "How is my plant doing?",
            },
            headers=auth_headers,
        )
        assert response.status_code == 400
        assert "Invalid plant ID format" in response.json()["message"]

    def test_ai_chat_plant_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Non-existent plant returns 404 Not Found."""
        random_uuid = str(uuid.uuid4())
        response = client.post(
            "/api/ai/chat",
            json={
                "plant_id": random_uuid,
                "question": "How is my plant doing?",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert "Plant not found" in response.json()["message"]

    def test_ai_chat_success(
        self,
        client: TestClient,
        auth_headers: dict,
        populated_plant_db: dict,
    ):
        """Authenticated user receives structured response from AI chat."""
        plant_id = str(populated_plant_db["plant_id"])

        mock_ai_msg = MagicMock()
        mock_ai_msg.type = "ai"
        mock_ai_msg.content = "Your Monstera has a recorded case of Powdery Mildew. Water weekly and keep leaves dry."

        mock_state = {
            "messages": [mock_ai_msg],
            "trace_messages": [],
            "errors": [],
        }

        with patch("app.routers.ai_chat.PlantifyChatRunner.run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = mock_state

            response = client.post(
                "/api/ai/chat",
                json={
                    "plant_id": plant_id,
                    "question": "What should I do about the powdery spots?",
                },
                headers=auth_headers,
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "answer" in data["data"]
            assert "Powdery Mildew" in data["data"]["answer"]
            assert data["data"]["plant_id"] == plant_id
            assert "thread_id" in data["data"]

            # Also verify /api/chat alias endpoint
            response_alias = client.post(
                "/api/chat",
                json={
                    "plant_id": plant_id,
                    "question": "What should I do about the powdery spots?",
                },
                headers=auth_headers,
            )
            assert response_alias.status_code == 200
            assert response_alias.json()["success"] is True

