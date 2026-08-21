"""
Product Recommendation Agent — LangChain tool-calling agent for real product selection.

Uses ChatGroq with structured tool-calling to:
1. Search the real PostgreSQL product database
2. Filter products by compatibility with the plant's problem
3. Check stock availability
4. Rank and select best / budget / premium recommendations
5. Generate human-readable explanations for each pick

CRITICAL DESIGN RULE:
    The LLM is NOT the source of product truth.
    Database = product truth (names, IDs, prices, stock, URLs).
    LLM = reasoning, ranking, and explanation.

    The agent MUST use tools to discover products. It MUST NEVER
    invent product names, IDs, prices, stock levels, or URLs.

Usage:
    agent = ProductRecommendationAgent(db=session)
    result = await agent.recommend(
        required_product_category="fungicide",
        plant_species="Rose",
        problem_category="fungal_disease",
        severity="medium",
        treatment_reason="Powdery mildew detected on leaves.",
    )
"""

import json
import logging
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.ai.graph.langchain_config import get_chat_model
from app.ai.tools.product_tools import create_product_tools
from app.ai.schemas.product_recommendation import (
    ProductRecommendation,
    ProductRecommendationResult,
)

logger = logging.getLogger(__name__)


# ── System Prompt ───────────────────────────────────────────────

PRODUCT_AGENT_SYSTEM_PROMPT = """Plantify Product Recommendation Agent.
1. Use tools (search_products, get_compatible_products, check_product_stock, get_product) to query real products from the DB.
2. Select up to 3 real products: best_recommendation, budget_alternative, premium_alternative.
3. Respond ONLY with valid JSON:
{
  "best_recommendation": {"product_id":"<UUID>","name":"<name>","reason":"<why>","price":12.99,"availability":"in_stock","recommendation_score":0.95,"usage_instructions":"..."},
  "budget_alternative": null or {...},
  "premium_alternative": null or {...},
  "status": "product_recommendation_complete" | "no_product_available",
  "reasoning": "summary"
}
Never invent product IDs or names. All product data MUST come from tool results."""


# ── Agent Class ─────────────────────────────────────────────────


class ProductRecommendationAgent:
    """
    LangChain tool-calling agent that recommends real products from the database.

    The agent uses ChatGroq with tool bindings to:
    1. Search products by category and keyword
    2. Find compatible products for the specific problem/species
    3. Check stock availability
    4. Retrieve full product details
    5. Rank and select best/budget/premium recommendations

    The LLM performs reasoning and ranking; all product data comes from tools.
    """

    def __init__(
        self,
        db: Session,
        model_name: str = "openai/gpt-oss-20b",
        temperature: float = 0.1,
        max_iterations: int = 8,
    ):
        """
        Initialize the product recommendation agent.

        Args:
            db: SQLAlchemy session for database queries.
            model_name: Groq model to use for reasoning.
            temperature: LLM temperature (low for deterministic tool use).
            max_iterations: Maximum tool-calling iterations before forcing output.
        """
        self.db = db
        self.max_iterations = max_iterations
        self.tools = create_product_tools(db)
        self.llm = get_chat_model(
            model_name=model_name,
            temperature=temperature,
            max_tokens=4096,
        )
        # Bind tools to the LLM for function calling
        self.llm_with_tools = self.llm.bind_tools(self.tools)

    async def recommend(
        self,
        required_product_category: str,
        plant_species: str = "",
        problem_category: str = "",
        severity: str = "none",
        treatment_reason: str = "",
    ) -> ProductRecommendationResult:
        """
        Run the product recommendation agent.

        Args:
            required_product_category: Category of product needed (e.g., "fungicide")
            plant_species: Common name of the plant species
            problem_category: Problem category (e.g., "fungal_disease")
            severity: Problem severity ("none", "low", "medium", "high", "critical")
            treatment_reason: Clinical rationale for the treatment

        Returns:
            ProductRecommendationResult with up to 3 recommendations.
        """
        # Build the user prompt with treatment context
        user_prompt = self._build_user_prompt(
            required_product_category=required_product_category,
            plant_species=plant_species,
            problem_category=problem_category,
            severity=severity,
            treatment_reason=treatment_reason,
        )

        messages = [
            SystemMessage(content=PRODUCT_AGENT_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]

        try:
            # Run the agent loop: LLM calls tools iteratively
            result = await self._run_agent_loop(messages)
            return result

        except Exception as e:
            logger.exception(
                "ProductRecommendationAgent: Agent execution failed: %s", e
            )
            return ProductRecommendationResult(
                status="no_product_available",
                reasoning=f"Agent execution failed: {str(e)}",
            )

    async def _run_agent_loop(
        self,
        messages: list,
    ) -> ProductRecommendationResult:
        """
        Execute the iterative tool-calling loop.

        The LLM calls tools, we execute them, feed results back,
        and repeat until the LLM provides a final answer or we hit
        max_iterations.
        """
        for iteration in range(self.max_iterations):
            logger.info(
                "ProductRecommendationAgent: iteration %d/%d",
                iteration + 1, self.max_iterations,
            )

            # Call the LLM
            response = await self.llm_with_tools.ainvoke(messages)
            messages.append(response)

            # Check if the LLM wants to call tools
            if response.tool_calls:
                # Execute each tool call
                for tool_call in response.tool_calls:
                    tool_result = await self._execute_tool_call(tool_call)
                    # Add tool result as a ToolMessage
                    from langchain_core.messages import ToolMessage
                    messages.append(
                        ToolMessage(
                            content=tool_result,
                            tool_call_id=tool_call["id"],
                        )
                    )
            else:
                # No more tool calls — LLM has provided its final answer
                return self._parse_agent_response(response.content)

        # Exhausted iterations — force the LLM to give a final answer
        logger.warning(
            "ProductRecommendationAgent: exhausted %d iterations, forcing final answer",
            self.max_iterations,
        )
        messages.append(
            HumanMessage(
                content=(
                    "You have used all available tool calls. "
                    "Please provide your final recommendation NOW as the JSON "
                    "object described in your instructions, based on the "
                    "products you have found so far."
                )
            )
        )
        response = await self.llm_with_tools.ainvoke(messages)
        return self._parse_agent_response(response.content)

    async def _execute_tool_call(self, tool_call: dict) -> str:
        """Execute a single tool call and return the result string."""
        tool_name = tool_call["name"]
        tool_args = tool_call.get("args", {})

        logger.info(
            "ProductRecommendationAgent: calling tool '%s' with args: %s",
            tool_name, tool_args,
        )

        # Find the matching tool
        tool_fn = None
        for t in self.tools:
            if t.name == tool_name:
                tool_fn = t
                break

        if tool_fn is None:
            error_msg = f"Unknown tool: {tool_name}"
            logger.warning("ProductRecommendationAgent: %s", error_msg)
            return json.dumps({"error": error_msg})

        try:
            result = tool_fn.invoke(tool_args)
            logger.info(
                "ProductRecommendationAgent: tool '%s' returned %d chars",
                tool_name, len(str(result)),
            )
            return str(result)
        except Exception as e:
            error_msg = f"Tool '{tool_name}' failed: {str(e)}"
            logger.exception("ProductRecommendationAgent: %s", error_msg)
            return json.dumps({"error": error_msg})

    def _parse_agent_response(
        self, content: str
    ) -> ProductRecommendationResult:
        """
        Parse the LLM's final text response into a ProductRecommendationResult.

        Extracts JSON from the response content, handling code blocks
        and mixed text+JSON formats.
        """
        if not content:
            return ProductRecommendationResult(
                status="no_product_available",
                reasoning="Agent returned empty response.",
            )

        # Try to extract JSON from the response
        json_str = self._extract_json(content)

        if not json_str:
            logger.warning(
                "ProductRecommendationAgent: could not extract JSON from response"
            )
            return ProductRecommendationResult(
                status="no_product_available",
                reasoning=f"Could not parse agent response: {content[:500]}",
            )

        try:
            data = json.loads(json_str)

            # Build recommendations from parsed data
            best = self._build_recommendation(data.get("best_recommendation"))
            budget = self._build_recommendation(data.get("budget_alternative"))
            premium = self._build_recommendation(data.get("premium_alternative"))

            has_recommendations = any([best, budget, premium])

            return ProductRecommendationResult(
                best_recommendation=best,
                budget_alternative=budget,
                premium_alternative=premium,
                status=(
                    "product_recommendation_complete"
                    if has_recommendations
                    else "no_product_available"
                ),
                reasoning=data.get("reasoning", ""),
            )

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(
                "ProductRecommendationAgent: JSON parse error: %s", e
            )
            return ProductRecommendationResult(
                status="no_product_available",
                reasoning=f"Failed to parse recommendation: {str(e)}",
            )

    @staticmethod
    def _extract_json(text: str) -> Optional[str]:
        """Extract a JSON object from text that may contain markdown code blocks."""
        # Try to find JSON in code blocks first
        import re
        code_block_pattern = re.compile(
            r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL
        )
        matches = code_block_pattern.findall(text)
        for match in matches:
            match = match.strip()
            if match.startswith("{"):
                return match

        # Try to find raw JSON object in text
        # Find the first { and last } pair
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            candidate = text[first_brace : last_brace + 1]
            try:
                json.loads(candidate)
                return candidate
            except json.JSONDecodeError:
                pass

        return None

    @staticmethod
    def _build_recommendation(
        data: Optional[dict],
    ) -> Optional[ProductRecommendation]:
        """Build a ProductRecommendation from a parsed dict, or None."""
        if not data or not isinstance(data, dict):
            return None

        # Require at minimum a product_id and name
        product_id = data.get("product_id")
        name = data.get("name")
        if not product_id or not name:
            return None

        try:
            return ProductRecommendation(
                product_id=str(product_id),
                name=str(name),
                reason=data.get("reason", "Recommended product."),
                price=float(data.get("price", 0.0)),
                availability=data.get("availability", "in_stock"),
                recommendation_score=float(
                    data.get("recommendation_score", 0.5)
                ),
                usage_instructions=data.get("usage_instructions"),
            )
        except (ValueError, TypeError) as e:
            logger.warning(
                "ProductRecommendationAgent: failed to build recommendation: %s",
                e,
            )
            return None

    @staticmethod
    def _build_user_prompt(
        required_product_category: str,
        plant_species: str,
        problem_category: str,
        severity: str,
        treatment_reason: str,
    ) -> str:
        """Build a compact user prompt with treatment context."""
        return f"Find real products for: Species: {plant_species or 'Plant'} | Problem: {problem_category or 'Issue'} | Severity: {severity} | Need: {required_product_category} | Reason: {treatment_reason or 'Treatment required'}. Use tools to query DB and return JSON."
