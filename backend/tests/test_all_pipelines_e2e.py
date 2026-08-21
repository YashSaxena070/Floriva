"""
End-to-End Verification Test Suite for all Plantify Pipelines:

Pipeline 1: Autonomous Vision & Diagnostics LangGraph Pipeline (with HITL pause/resume)
Pipeline 2: Conversational Plant Memory Chat Agent Pipeline
Pipeline 3: Deterministic 7-Step Product Recommendation Pipeline
"""

import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.orm import Session
from langchain_core.messages import AIMessage

from app.models.plant import Plant
from app.models.plant_scan import PlantScan, ScanStatus
from app.models.product import Product, Category
from app.models.cart import Cart, CartItem
from app.ai.graph.runner import PlantifyGraphRunner
from app.ai.graph.chat_graph import PlantifyChatRunner
from app.ai.services.recommendation_pipeline import (
    RecommendationPipeline,
    CategoryResolver,
    ProductQuery,
    CompatibilityFilter,
    AvailabilityFilter,
    PriceRanker,
    RelevanceScorer,
    ResultBuilder,
    PipelineContext,
)
from app.ai.schemas.product_recommendation import ProductRecommendationResult, ProductRecommendation
from app.repositories.product_repository import ProductRepository


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def setup_pipeline_db(db_session: Session, registered_user: dict):
    """Seed comprehensive test database for end-to-end pipeline execution."""
    user_id = uuid.UUID(registered_user["user"]["id"])

    # 1. Create plant
    plant = Plant(
        user_id=user_id,
        name="Snake Plant",
        scientific_name="Dracaena trifasciata",
        identification_confidence=0.95,
        image_url="uploads/plants/snake_plant.jpg",
    )
    db_session.add(plant)
    db_session.commit()
    db_session.refresh(plant)

    # 2. Create categories
    cat_fungicide = Category(name="Fungicide", slug="fungicide", description="Fungicides")
    cat_pest = Category(name="Pest Control", slug="pest_control", description="Pesticides")
    cat_fert = Category(name="Fertilizer", slug="fertilizer", description="Plant food")
    db_session.add_all([cat_fungicide, cat_pest, cat_fert])
    db_session.commit()
    db_session.refresh(cat_fungicide)
    db_session.refresh(cat_pest)
    db_session.refresh(cat_fert)

    # 3. Create products across price tiers
    prod_budget = Product(
        name="Copper Fungicide Spray",
        brand="EcoGarden",
        category_id=cat_fungicide.id,
        price=149.00,
        stock=25,
        active=True,
    )
    prod_mid = Product(
        name="Organic Neem Oil Concentrate",
        brand="PureFlora",
        category_id=cat_fungicide.id,
        price=399.00,
        stock=50,
        active=True,
    )
    prod_premium = Product(
        name="Bio-Advanced Disease & Pest Protector",
        brand="AgriTech Pro",
        category_id=cat_fungicide.id,
        price=899.00,
        stock=15,
        active=True,
    )
    db_session.add_all([prod_budget, prod_mid, prod_premium])
    db_session.commit()
    db_session.refresh(prod_budget)
    db_session.refresh(prod_mid)
    db_session.refresh(prod_premium)

    # 4. Create scan
    scan = PlantScan(
        plant_id=plant.id,
        image_url="uploads/scans/test_leaf.jpg",
        status=ScanStatus.COMPLETED,
    )
    db_session.add(scan)
    db_session.commit()
    db_session.refresh(scan)

    return {
        "user_id": user_id,
        "plant": plant,
        "scan": scan,
        "products": {
            "budget": prod_budget,
            "mid": prod_mid,
            "premium": prod_premium,
        },
    }


# ── Pipeline 1: Autonomous Vision & Diagnostics LangGraph ─────────────


class TestPipeline1LangGraphWorkflow:
    """Verifies Pipeline 1: LangGraph Scan Pipeline & HITL Interruption."""

    @pytest.mark.asyncio
    async def test_full_graph_lifecycle_with_hitl_interrupt_and_resume(
        self, db_session: Session, setup_pipeline_db: dict
    ):
        """
        Verify that the graph executes through nodes:
        load_plant_context -> image_validation -> plant_identification ->
        health_analysis -> plant_analysis -> treatment_decision ->
        product_recommendation -> cart_decision -> human_confirmation (PAUSE)
        and then resumes on user approval -> add_to_cart -> END.
        """
        user_id = str(setup_pipeline_db["user_id"])
        plant_id = str(setup_pipeline_db["plant"].id)
        scan_id = str(setup_pipeline_db["scan"].id)

        runner = PlantifyGraphRunner(db=db_session)
        prod = setup_pipeline_db["products"]["mid"]

        # Mock external AI API calls for deterministic pipeline testing
        with patch("app.ai.graph.nodes.validate_image_on_disk", return_value={"valid": True, "format": "JPEG", "width": 800, "height": 600, "file_size": 102400}), \
             patch("app.ai.services.plant_identification_service.PlantIdentificationService.identify", new_callable=AsyncMock) as mock_id, \
             patch("app.ai.services.health_analysis_service.HealthAnalysisService.analyze", new_callable=AsyncMock) as mock_health, \
             patch("app.ai.services.ai_analysis_service.AIAnalysisService.analyze", new_callable=AsyncMock) as mock_care, \
             patch("app.ai.agents.product_agent.ProductRecommendationAgent.recommend", new_callable=AsyncMock) as mock_prod:

            mock_id.return_value = {
                "plant": {
                    "name": "Snake Plant",
                    "scientificName": "Dracaena trifasciata",
                    "confidence": 0.94,
                    "family": "Asparagaceae",
                },
                "alternatives": [],
            }

            mock_health.return_value = {
                "healthStatus": "diseased",
                "issue": "Powdery Mildew",
                "confidence": 0.91,
                "severity": "medium",
                "symptoms": ["White powdery spots on foliage"],
                "possibleCauses": ["Excess humidity", "Poor air circulation"],
            }

            mock_care.return_value = {
                "summary": "Snake plant requires active fungal treatment.",
                "care": {
                    "watering": "Water every 2-3 weeks",
                    "sunlight": "Indirect bright light",
                    "temperature": "65-80F",
                    "humidity": "40-50%",
                    "soil": "Cactus mix",
                    "fertilization": "Monthly",
                    "pruning": "Trim damaged tips",
                },
                "problem": {
                    "detected": True,
                    "name": "Powdery Mildew",
                    "category": "fungal_disease",
                    "severity": "medium",
                    "description": "Fungal pathogen on leaves",
                },
                "treatment": {
                    "required": True,
                    "product_category": "fungicide",
                    "recommended_actions": ["Apply organic neem oil fungicide"],
                    "frequency": "Every 7 days",
                    "estimated_duration": "2-3 weeks",
                    "precautions": ["Do not spray in direct sunlight"],
                    "instructions": "Spray affected leaves evenly.",
                },
                "provider": "groq",
            }

            mock_prod.return_value = ProductRecommendationResult(
                status="product_recommendation_complete",
                best_recommendation=ProductRecommendation(
                    product_id=str(prod.id),
                    name=prod.name,
                    reason="Effective organic fungicide for fungal mildew.",
                    price=float(prod.price),
                    availability="in_stock",
                    recommendation_score=0.95,
                    usage_instructions="Apply once weekly.",
                ),
                reasoning="Matched organic neem oil for powdery mildew.",
            )

            # Phase A: Initial Run up to HITL Interrupt Point
            state = await runner.run(
                user_id=user_id,
                plant_id=plant_id,
                scan_id=scan_id,
                image_urls=["uploads/scans/test_leaf.jpg"],
            )

            # Assert pipeline paused at human_confirmation
            assert state.get("plant_species") == "Snake Plant" or state.get("plant_name") == "Snake Plant"
            assert state.get("health_status") == "diseased"
            assert state.get("treatment_required") is True
            assert state.get("cart_action") == "add"
            cart_decision = state.get("cart_decision_data", {})
            assert cart_decision.get("recommended_product_id") == str(prod.id)
            assert state.get("cart_item_added") == {} or not state.get("cart_item_added")

            # Phase B: Resume on User Confirmation (HITL Approval)
            resumed_state = await runner.resume(
                scan_id=scan_id,
                user_id=user_id,
                action="approve",
            )

            # Assert graph resumed and completed add_to_cart
            assert resumed_state.get("cart_confirmation") == "approved"
            assert len(resumed_state.get("cart_item_added", {})) > 0

            # Verify cart item exists in database
            cart = db_session.query(Cart).filter(Cart.user_id == uuid.UUID(user_id)).first()
            assert cart is not None
            cart_item = db_session.query(CartItem).filter(
                CartItem.cart_id == cart.id,
                CartItem.product_id == prod.id,
            ).first()
            assert cart_item is not None
            assert cart_item.quantity >= 1


# ── Pipeline 2: Conversational Plant Memory Chat Agent ────────────────


class TestPipeline2ChatAgentWorkflow:
    """Verifies Pipeline 2: PlantifyChatGraph & Tool Execution."""

    @pytest.mark.asyncio
    async def test_chat_runner_with_plant_tools_execution(
        self, db_session: Session, setup_pipeline_db: dict
    ):
        """Verify chat runner processes user questions with persistent context."""
        user_id = str(setup_pipeline_db["user_id"])
        plant_id = str(setup_pipeline_db["plant"].id)

        runner = PlantifyChatRunner(db=db_session)

        mock_ai_response = AIMessage(
            content="Your Snake Plant is currently recorded with healthy baselines."
        )

        with patch("app.ai.graph.chat_graph.get_chat_model") as mock_model_getter:
            mock_llm = MagicMock()
            mock_bound_llm = MagicMock()
            mock_bound_llm.ainvoke = AsyncMock(return_value=mock_ai_response)
            mock_llm.bind_tools.return_value = mock_bound_llm
            mock_model_getter.return_value = mock_llm

            result_state = await runner.run(
                user_id=user_id,
                plant_id=plant_id,
                question="How often should I water my Snake Plant?",
            )

            assert len(result_state.get("messages", [])) > 0
            assert len(result_state.get("errors", [])) == 0
            last_msg = result_state["messages"][-1]
            assert "Snake Plant" in last_msg.content


# ── Pipeline 3: Step-Based 7-Step Recommendation Pipeline ────────────


class TestPipeline3StepRecommendationPipeline:
    """Verifies Pipeline 3: 7-Step Deterministic Product Recommendation Pipeline."""

    def test_all_seven_pipeline_steps_execute_sequentially(
        self, db_session: Session, setup_pipeline_db: dict
    ):
        """Test step-by-step pipeline execution and tiered product output."""
        pipeline = RecommendationPipeline(db_session)

        result = pipeline.run(
            treatment_data={
                "required": True,
                "product_category": "fungicide",
                "recommended_actions": ["Apply fungicide"],
            },
            problem_category="fungal_disease",
            problem_severity="medium",
            plant_species="Snake Plant",
        )

        assert result is not None
        assert len(result.recommendations) >= 1
        assert result.treatment_context.product_category == "fungicide"
        assert result.treatment_context.problem_category == "fungal_disease"

        # Verify best match is present
        match_types = [r.match_type for r in result.recommendations]
        assert "best_match" in match_types

    def test_individual_pipeline_steps_isolation(
        self, db_session: Session, setup_pipeline_db: dict
    ):
        """Isolate and test each individual step of the 7-step pipeline."""
        context = PipelineContext(
            treatment_data={"product_category": "fungicide"},
            problem_category="fungal_disease",
            plant_species="Snake Plant",
        )

        # Step 1: CategoryResolver
        s1 = CategoryResolver()
        context = s1.run(context)
        assert "fungicide" in context.resolved_category_slugs

        # Step 2: ProductQuery
        repo = ProductRepository(db_session)
        s2 = ProductQuery(repo)
        context = s2.run(context)
        assert len(context.candidate_products) >= 3

        # Step 3: CompatibilityFilter
        s3 = CompatibilityFilter()
        context = s3.run(context)
        assert len(context.compatible_products) >= 1

        # Step 4: AvailabilityFilter
        s4 = AvailabilityFilter()
        context = s4.run(context)
        assert len(context.available_products) >= 1

        # Step 5: PriceRanker
        s5 = PriceRanker()
        context = s5.run(context)
        assert len(context.scored_products) >= 1
        tiers = {sp.price_tier for sp in context.scored_products}
        assert len(tiers) >= 1

        # Step 6: RelevanceScorer
        s6 = RelevanceScorer()
        context = s6.run(context)
        for sp in context.scored_products:
            assert sp.relevance_score >= 0.0

        # Step 7: ResultBuilder
        s7 = ResultBuilder()
        context = s7.run(context)
        assert context.result is not None
        assert len(context.result.recommendations) >= 1
