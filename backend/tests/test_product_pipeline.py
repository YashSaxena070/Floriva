"""
Unit and integration tests for every pipeline in the Plantify Recommended Product System:
1. Database & LangChain Product Tools (search_products, get_compatible_products, check_product_stock, etc.)
2. ProductRecommendationAgent ReAct Agent Loop (LLM tool-calling, ranking, stock-checking, reasoning)
3. LangGraph Product Recommendation Node (Plant memory filtering, already purchased items, category mapping)
4. Treatment Decision -> Product Recommendation -> Cart Decision Routing
5. Human Confirmation & Add-to-Cart Pipeline Execution
"""

import json
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.orm import Session
from decimal import Decimal

from app.models.product import Product, Category, ProductCompatibility
from app.models.cart import Cart, CartItem
from app.models.plant import Plant
from app.repositories.product_repository import ProductRepository
from app.ai.tools.product_tools import create_product_tools
from app.ai.agents.product_agent import ProductRecommendationAgent
from app.ai.schemas.product_recommendation import (
    ProductRecommendation,
    ProductRecommendationResult,
)
from app.ai.graph.nodes import (
    treatment_decision_node,
    product_recommendation_node,
    cart_decision_node,
    human_confirmation_node,
    add_to_cart_node,
)
from app.ai.graph.state import create_initial_state


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def product_catalog_db(db_session: Session):
    """Seed a rich product catalog with categories and compatibilities."""
    # 1. Categories
    cat_fungicide = Category(name="Fungicide", slug="fungicide", description="Treat fungal diseases")
    cat_fertilizer = Category(name="Fertilizer", slug="fertilizer", description="Nutrients and boosters")
    cat_pest = Category(name="Pest Control", slug="pest_control", description="Insecticides and pest traps")
    db_session.add_all([cat_fungicide, cat_fertilizer, cat_pest])
    db_session.commit()

    # 2. Products
    p1 = Product(
        name="Copper Bio-Fungicide Spray",
        brand="PlantGuard",
        category_id=cat_fungicide.id,
        price=Decimal("499.00"),
        stock=25,
        active=True,
        description="Effective against leaf spot and powdery mildew.",
        usage_instructions="Spray twice weekly on affected foliage.",
    )
    p2 = Product(
        name="Budget Sulfur Dust Fungicide",
        brand="EcoGarden",
        category_id=cat_fungicide.id,
        price=Decimal("199.00"),
        stock=50,
        active=True,
        description="Economical organic sulfur powder for fungal control.",
        usage_instructions="Dust lightly on foliage.",
    )
    p3 = Product(
        name="Premium Organic Neem Pro",
        brand="BioCare",
        category_id=cat_pest.id,
        price=Decimal("799.00"),
        stock=15,
        active=True,
        description="Cold pressed pure neem oil for mites and aphids.",
        usage_instructions="Dilute 5ml in 1L water.",
    )
    p4 = Product(
        name="Out-of-Stock Liquid Miracle Fertilizer",
        brand="GreenBoost",
        category_id=cat_fertilizer.id,
        price=Decimal("350.00"),
        stock=0,
        active=True,
        description="Liquid micro-nutrient booster.",
    )
    db_session.add_all([p1, p2, p3, p4])
    db_session.commit()

    # 3. Compatibilities
    c1 = ProductCompatibility(
        product_id=p1.id,
        problem_category="fungal_disease",
        plant_species="Monstera deliciosa",
    )
    c2 = ProductCompatibility(
        product_id=p2.id,
        problem_category="fungal_disease",
        plant_species="Rose",
    )
    c3 = ProductCompatibility(
        product_id=p3.id,
        problem_category="pest_infestation",
        plant_species=None,
    )
    db_session.add_all([c1, c2, c3])
    db_session.commit()

    return {
        "categories": {"fungicide": cat_fungicide, "fertilizer": cat_fertilizer, "pest": cat_pest},
        "products": {"copper": p1, "sulfur": p2, "neem": p3, "fertilizer": p4},
    }


# ── Pipeline 1: LangChain Product Tools ──────────────────────────────


class TestProductToolsPipeline:
    """Tests for all 5 product tools directly interacting with the database."""

    def test_tool_search_products_by_category(self, db_session: Session, product_catalog_db: dict):
        tools = create_product_tools(db_session)
        tool_map = {t.name: t for t in tools}

        search_tool = tool_map["search_products"]
        res_json = search_tool.invoke({"category": "fungicide"})
        data = json.loads(res_json)

        assert data["count"] == 2
        names = [p["name"] for p in data["products"]]
        assert "Copper Bio-Fungicide Spray" in names
        assert "Budget Sulfur Dust Fungicide" in names

    def test_tool_search_products_with_keyword(self, db_session: Session, product_catalog_db: dict):
        tools = create_product_tools(db_session)
        search_tool = next(t for t in tools if t.name == "search_products")

        res_json = search_tool.invoke({"category": "fungicide", "keyword": "Sulfur"})
        data = json.loads(res_json)

        assert data["count"] == 1
        assert data["products"][0]["name"] == "Budget Sulfur Dust Fungicide"

    def test_tool_get_compatible_products(self, db_session: Session, product_catalog_db: dict):
        tools = create_product_tools(db_session)
        compat_tool = next(t for t in tools if t.name == "get_compatible_products")

        res_json = compat_tool.invoke({
            "problem_category": "fungal_disease",
            "plant_species": "Monstera deliciosa",
        })
        data = json.loads(res_json)

        assert data["count"] >= 1
        assert data["products"][0]["name"] == "Copper Bio-Fungicide Spray"

    def test_tool_check_product_stock(self, db_session: Session, product_catalog_db: dict):
        tools = create_product_tools(db_session)
        stock_tool = next(t for t in tools if t.name == "check_product_stock")

        p_instock = product_catalog_db["products"]["copper"]
        res_json = stock_tool.invoke({"product_id": str(p_instock.id)})
        data = json.loads(res_json)

        assert data["availability"] == "in_stock"
        assert data["stock"] == 25

        p_out = product_catalog_db["products"]["fertilizer"]
        res_out = json.loads(stock_tool.invoke({"product_id": str(p_out.id)}))
        assert res_out["availability"] == "out_of_stock"
        assert res_out["stock"] == 0

    def test_tool_get_product_details(self, db_session: Session, product_catalog_db: dict):
        tools = create_product_tools(db_session)
        get_tool = next(t for t in tools if t.name == "get_product")

        p = product_catalog_db["products"]["neem"]
        res_json = get_tool.invoke({"product_id": str(p.id)})
        data = json.loads(res_json)

        assert "product" in data
        assert data["product"]["name"] == "Premium Organic Neem Pro"
        assert data["product"]["price"] == 799.00
        assert "Dilute 5ml in 1L water." in data["product"]["usage_instructions"]


# ── Pipeline 2: ProductRecommendationAgent ReAct Loop ─────────────────


class TestProductRecommendationAgentPipeline:
    """Tests for the LLM-driven Product Recommendation Agent reasoning loop."""

    @pytest.mark.asyncio
    async def test_agent_recommend_successful_ranking(self, db_session: Session, product_catalog_db: dict):
        agent = ProductRecommendationAgent(db=db_session)
        p_copper = product_catalog_db["products"]["copper"]
        p_sulfur = product_catalog_db["products"]["sulfur"]

        # Mock the agent loop to return structured recommendation
        mock_result = ProductRecommendationResult(
            status="product_recommendation_complete",
            reasoning="Copper Bio-Fungicide Spray is ideal for Monstera leaf spot. Sulfur dust is a great budget pick.",
            best_recommendation=ProductRecommendation(
                product_id=str(p_copper.id),
                name=p_copper.name,
                price=499.00,
                availability="in_stock",
                recommendation_score=0.95,
                reason="Specifically tested for Monstera fungal leaf spot.",
                usage_instructions=p_copper.usage_instructions,
            ),
            budget_alternative=ProductRecommendation(
                product_id=str(p_sulfur.id),
                name=p_sulfur.name,
                price=199.00,
                availability="in_stock",
                recommendation_score=0.80,
                reason="Affordable organic alternative for mild infections.",
            ),
        )

        with patch.object(agent, "_run_agent_loop", new_callable=AsyncMock) as mock_loop:
            mock_loop.return_value = mock_result

            result = await agent.recommend(
                required_product_category="fungicide",
                plant_species="Monstera deliciosa",
                problem_category="fungal_disease",
                severity="medium",
                treatment_reason="Fungal leaf spot detected.",
            )

            assert result.status == "product_recommendation_complete"
            assert result.best_recommendation is not None
            assert result.best_recommendation.name == "Copper Bio-Fungicide Spray"
            assert result.budget_alternative is not None
            assert result.budget_alternative.price == 199.00

            rec_list = result.to_recommended_products_list()
            assert len(rec_list) == 2
            assert rec_list[0]["match_type"] == "best_match"
            assert rec_list[1]["match_type"] == "budget_option"

    @pytest.mark.asyncio
    async def test_agent_handles_no_products_found(self, db_session: Session):
        agent = ProductRecommendationAgent(db=db_session)
        mock_result = ProductRecommendationResult(
            status="no_product_available",
            reasoning="No products found in database for rare carnivorous plant fungicide.",
        )

        with patch.object(agent, "_run_agent_loop", new_callable=AsyncMock) as mock_loop:
            mock_loop.return_value = mock_result

            result = await agent.recommend(
                required_product_category="fungicide",
                plant_species="Dionaea muscipula",
                problem_category="fungal_disease",
                severity="low",
                treatment_reason="Mild mold on soil.",
            )

            assert result.status == "no_product_available"
            assert len(result.to_recommended_products_list()) == 0


# ── Pipeline 3: LangGraph product_recommendation_node ─────────────────


class TestProductRecommendationNodePipeline:
    """Tests for the LangGraph product_recommendation_node execution and memory integration."""

    @pytest.mark.asyncio
    async def test_node_recommends_and_updates_state(self, db_session: Session, product_catalog_db: dict):
        p_copper = product_catalog_db["products"]["copper"]

        initial_state = create_initial_state()
        initial_state["required_product_category"] = "fungicide"
        initial_state["plant_species"] = "Monstera deliciosa"
        initial_state["problem_category"] = "fungal_disease"
        initial_state["severity"] = "high"
        initial_state["treatment_reason"] = "Severe leaf spot infection"
        initial_state["cart_history"] = []

        mock_agent_result = ProductRecommendationResult(
            status="product_recommendation_complete",
            reasoning="Recommended copper spray.",
            best_recommendation=ProductRecommendation(
                product_id=str(p_copper.id),
                name=p_copper.name,
                price=499.00,
                availability="in_stock",
                recommendation_score=0.95,
                reason="Proven copper fungicide.",
            ),
        )

        with patch("app.ai.agents.product_agent.ProductRecommendationAgent.recommend", new_callable=AsyncMock) as mock_rec:
            mock_rec.return_value = mock_agent_result

            config = {"configurable": {"db": db_session}}
            output_state = await product_recommendation_node(initial_state, config=config)

            assert "recommended_products" in output_state
            assert len(output_state["recommended_products"]) == 1
            assert output_state["recommended_products"][0]["product_id"] == str(p_copper.id)

    @pytest.mark.asyncio
    async def test_node_filters_out_already_purchased_products(self, db_session: Session, product_catalog_db: dict):
        p_copper = product_catalog_db["products"]["copper"]
        p_sulfur = product_catalog_db["products"]["sulfur"]

        initial_state = create_initial_state()
        initial_state["required_product_category"] = "fungicide"
        initial_state["plant_species"] = "Monstera deliciosa"
        # User already purchased copper spray in their cart history!
        initial_state["cart_history"] = [{"product_id": str(p_copper.id), "product_name": p_copper.name}]

        mock_agent_result = ProductRecommendationResult(
            status="product_recommendation_complete",
            reasoning="Both copper and sulfur are candidates.",
            best_recommendation=ProductRecommendation(
                product_id=str(p_copper.id),
                name=p_copper.name,
                price=499.00,
                availability="in_stock",
                recommendation_score=0.95,
                reason="Copper spray.",
            ),
            budget_alternative=ProductRecommendation(
                product_id=str(p_sulfur.id),
                name=p_sulfur.name,
                price=199.00,
                availability="in_stock",
                recommendation_score=0.80,
                reason="Sulfur dust.",
            ),
        )

        with patch("app.ai.agents.product_agent.ProductRecommendationAgent.recommend", new_callable=AsyncMock) as mock_rec:
            mock_rec.return_value = mock_agent_result

            config = {"configurable": {"db": db_session}}
            output_state = await product_recommendation_node(initial_state, config=config)

            # Copper spray must be filtered out by plant memory!
            rec_ids = [p["product_id"] for p in output_state["recommended_products"]]
            assert str(p_copper.id) not in rec_ids
            assert str(p_sulfur.id) in rec_ids


# ── Pipeline 4: Treatment Decision -> Cart Decision Pipeline ───────────


class TestTreatmentToCartPipeline:
    """Tests the full pipeline routing from treatment necessity to cart recommendation."""

    @pytest.mark.asyncio
    async def test_treatment_required_leads_to_cart_add_decision(self, db_session: Session, product_catalog_db: dict):
        p_copper = product_catalog_db["products"]["copper"]

        # 1. State after diagnosis
        state = create_initial_state()
        state["treatment_required"] = True
        state["problem_category"] = "fungal_disease"
        state["required_product_category"] = "fungicide"
        state["disease"] = "Leaf Spot"
        state["severity"] = "medium"
        state["plant_species"] = "Monstera deliciosa"
        state["cart_history"] = []

        # 2. Run treatment decision
        treatment_output = await treatment_decision_node(state)
        state.update(treatment_output)
        assert state["treatment_required"] is True
        assert state["required_product_category"] == "fungicide"

        # 3. Supply product recommendation
        state["recommended_products"] = [
            {
                "product_id": str(p_copper.id),
                "name": p_copper.name,
                "price": float(p_copper.price),
                "stock": p_copper.stock,
                "reason": "Top pick for leaf spot",
            }
        ]

        # 4. Run cart decision
        cart_output = await cart_decision_node(state)
        assert cart_output["cart_action"] == "add"
        assert cart_output["cart_decision_data"]["recommended_product_id"] == str(p_copper.id)
        assert cart_output["cart_decision_data"]["quantity"] == 1
        assert len(cart_output["cart_decision_data"]["buy_links"]) > 0


# ── Pipeline 5: Human Confirmation & Add-to-Cart Pipeline ─────────────


class TestHumanConfirmationAndAddToCartPipeline:
    """Tests the Human-in-the-loop cart confirmation and PostgreSQL cart record insertion."""

    @pytest.mark.asyncio
    async def test_human_confirmation_node_lifecycle(self):
        state = create_initial_state()
        state["cart_action"] = "add"

        # 1. First execution -> pending
        pending_out = await human_confirmation_node(state)
        assert pending_out["cart_confirmation"] == "pending"

        # 2. User approves -> approved
        state["cart_confirmation"] = "approved"
        approved_out = await human_confirmation_node(state)
        assert approved_out["cart_confirmation"] == "approved"

        # 3. User declines -> declined
        state["cart_confirmation"] = "declined"
        declined_out = await human_confirmation_node(state)
        assert declined_out["cart_confirmation"] == "declined"
        assert declined_out["cart_action"] == "skip"

    @pytest.mark.asyncio
    async def test_add_to_cart_node_creates_cart_item_in_db(
        self, db_session: Session, registered_user: dict, product_catalog_db: dict
    ):
        user_id = registered_user["user"]["id"]
        p_copper = product_catalog_db["products"]["copper"]

        # Prepare state ready for add_to_cart
        state = create_initial_state()
        state["user_id"] = user_id
        state["cart_action"] = "add"
        state["cart_confirmation"] = "approved"
        state["cart_decision_data"] = {
            "recommended_product_id": str(p_copper.id),
            "quantity": 1,
            "reason": "Top pick for leaf spot",
        }

        config = {"configurable": {"db": db_session}}
        output = await add_to_cart_node(state, config=config)

        assert "cart_item_added" in output
        assert output["cart_item_added"]["product_id"] == str(p_copper.id)
        assert len(output["buy_links"]) > 0

        # Verify in PostgreSQL
        cart_item = db_session.query(CartItem).filter(CartItem.product_id == p_copper.id).first()
        assert cart_item is not None
        assert cart_item.quantity == 1
