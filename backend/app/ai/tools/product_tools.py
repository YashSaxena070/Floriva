"""
LangChain tools for querying the Plantify product database.

These tools wrap the existing ProductRepository methods, providing the
product recommendation agent with access to real product data.

CRITICAL DESIGN RULE:
    The LLM is NOT the source of product truth.
    Database = product truth.
    LLM = reasoning / ranking / explanation.

    The LLM MUST use these tools to discover products. It must NEVER
    invent product names, IDs, prices, stock levels, or URLs.

Usage:
    tools = create_product_tools(db_session)
    # Pass `tools` to the agent or bind to a ChatModel
"""

import json
import logging
import uuid
from typing import Optional

from langchain_core.tools import tool, BaseTool, ToolException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.product import Product
from app.repositories.product_repository import ProductRepository

logger = logging.getLogger(__name__)


# ── Serialization Helper ────────────────────────────────────────

def _serialize_product(product: Product) -> dict:
    """
    Convert a SQLAlchemy Product to a plain dict safe for LLM consumption.

    Returns only the fields the agent needs to reason about — never raw
    ORM objects or internal metadata.
    """
    stock = int(product.stock)
    if stock <= 0:
        availability = "out_of_stock"
    elif stock < 10:
        availability = "low_stock"
    else:
        availability = "in_stock"

    return {
        "product_id": str(product.id),
        "name": product.name,
        "description": product.description or "",
        "brand": product.brand or "",
        "category": product.category.name if product.category else "",
        "category_slug": product.category.slug if product.category else "",
        "price": float(product.price),
        "stock": stock,
        "availability": availability,
        "image_url": product.image_url or "",
        "usage_instructions": product.usage_instructions or "",
        "active": product.active,
        "compatibilities": [
            {
                "problem_category": c.problem_category,
                "plant_species": c.plant_species,
            }
            for c in (product.compatibilities or [])
        ],
    }


def _serialize_product_list(products: list[Product]) -> str:
    """Serialize a list of products to a JSON string for the LLM."""
    serialized = [_serialize_product(p) for p in products]
    if not serialized:
        return json.dumps({"products": [], "count": 0})
    return json.dumps({"products": serialized, "count": len(serialized)})


# ── Tool Input Schemas ──────────────────────────────────────────

class SearchProductsInput(BaseModel):
    """Input schema for the search_products tool."""
    category: str = Field(
        ...,
        description=(
            "Product category slug to search. Must be one of: "
            "fertilizer, soil, soil_amendment, fungicide, pest_control, "
            "plant_care, gardening_tools. "
            "Use the category that best matches the treatment need."
        ),
    )
    keyword: Optional[str] = Field(
        default=None,
        description=(
            "Optional keyword to narrow results (e.g. 'neem', 'copper', "
            "'nitrogen'). Searches product name, description, and brand."
        ),
    )


class GetProductInput(BaseModel):
    """Input schema for the get_product tool."""
    product_id: str = Field(
        ...,
        description=(
            "The UUID of the product to retrieve. "
            "Must be a valid product ID obtained from search_products "
            "or get_compatible_products — NEVER invent product IDs."
        ),
    )


class CheckProductStockInput(BaseModel):
    """Input schema for the check_product_stock tool."""
    product_id: str = Field(
        ...,
        description=(
            "The UUID of the product to check stock for. "
            "Must be a valid product ID from a previous search."
        ),
    )


class GetCompatibleProductsInput(BaseModel):
    """Input schema for the get_compatible_products tool."""
    problem_category: str = Field(
        ...,
        description=(
            "The plant problem category. Must be one of: "
            "healthy, fungal_disease, bacterial_disease, viral_disease, "
            "pest_infestation, nutrient_deficiency, environmental_stress, "
            "overwatering, underwatering, root_rot, sunburn, other."
        ),
    )
    plant_species: Optional[str] = Field(
        default=None,
        description=(
            "Common name of the plant species for species-specific "
            "compatibility filtering (e.g. 'Snake Plant', 'Rose'). "
            "If omitted, returns universally compatible products."
        ),
    )


# ── Tool Factory ────────────────────────────────────────────────


def create_product_tools(db: Session) -> list[BaseTool]:
    """
    Factory that creates LangChain tools bound to a database session.

    Each tool closure captures the `db` session so the agent can query
    real products without passing DB sessions through the LLM interface.

    Args:
        db: SQLAlchemy Session for database queries.

    Returns:
        List of 4 LangChain tools: search_products, get_product,
        check_product_stock, get_compatible_products.
    """
    repo = ProductRepository(db)

    # ── Tool 1: search_products ─────────────────────────────────

    @tool("search_products", args_schema=SearchProductsInput)
    def search_products(category: str, keyword: Optional[str] = None) -> str:
        """
        Search for products by category and optional keyword.

        Use this tool to find products that match a treatment category.
        Returns a list of real products from the Plantify database.

        IMPORTANT: Only use category slugs from this list:
        fertilizer, soil, soil_amendment, fungicide, pest_control,
        plant_care, gardening_tools.
        """
        try:
            # Primary search: by category slug
            products = repo.get_products_by_category_slugs(
                category_slugs=[category.lower().strip()],
                active_only=True,
            )

            # If keyword provided and we have results, filter further
            if keyword and products:
                keyword_lower = keyword.lower()
                filtered = [
                    p for p in products
                    if (keyword_lower in (p.name or "").lower()
                        or keyword_lower in (p.description or "").lower()
                        or keyword_lower in (p.brand or "").lower())
                ]
                # Use filtered if it has results, otherwise keep all from category
                if filtered:
                    products = filtered

            # If category search returned nothing and we have a keyword, try text search
            if not products and keyword:
                products = repo.search_products(keyword)

            logger.info(
                "Tool[search_products]: category=%s, keyword=%s → %d products",
                category, keyword, len(products),
            )
            return _serialize_product_list(products)

        except Exception as e:
            logger.exception("Tool[search_products] error: %s", e)
            raise ToolException(f"Product search failed: {str(e)}")

    # ── Tool 2: get_product ─────────────────────────────────────

    @tool("get_product", args_schema=GetProductInput)
    def get_product(product_id: str) -> str:
        """
        Get detailed information about a specific product by its ID.

        Use this tool to get full product details including usage instructions,
        compatibility information, stock levels, and pricing.

        The product_id MUST be a valid UUID obtained from a previous
        search_products or get_compatible_products call.
        """
        try:
            product_uuid = uuid.UUID(product_id)
            product = repo.get_product_by_id(product_uuid)

            if not product:
                return json.dumps({
                    "error": f"Product with ID {product_id} not found.",
                    "product": None,
                })

            serialized = _serialize_product(product)
            logger.info(
                "Tool[get_product]: id=%s → %s ($%.2f)",
                product_id, product.name, float(product.price),
            )
            return json.dumps({"product": serialized})

        except ValueError:
            return json.dumps({
                "error": f"Invalid product ID format: {product_id}. Must be a valid UUID.",
                "product": None,
            })
        except Exception as e:
            logger.exception("Tool[get_product] error: %s", e)
            raise ToolException(f"Product lookup failed: {str(e)}")

    # ── Tool 3: check_product_stock ─────────────────────────────

    @tool("check_product_stock", args_schema=CheckProductStockInput)
    def check_product_stock(product_id: str) -> str:
        """
        Check the current stock level and availability of a product.

        Returns stock count and availability status:
        - "in_stock": 10 or more units available
        - "low_stock": 1-9 units available
        - "out_of_stock": 0 units available

        The product_id MUST be a valid UUID from a previous search.
        """
        try:
            product_uuid = uuid.UUID(product_id)
            product = repo.get_product_by_id(product_uuid)

            if not product:
                return json.dumps({
                    "error": f"Product with ID {product_id} not found.",
                    "stock": None,
                })

            stock = int(product.stock)
            if stock <= 0:
                availability = "out_of_stock"
            elif stock < 10:
                availability = "low_stock"
            else:
                availability = "in_stock"

            result = {
                "product_id": product_id,
                "name": product.name,
                "stock": stock,
                "availability": availability,
                "active": product.active,
            }

            logger.info(
                "Tool[check_product_stock]: id=%s → stock=%d (%s)",
                product_id, stock, availability,
            )
            return json.dumps(result)

        except ValueError:
            return json.dumps({
                "error": f"Invalid product ID format: {product_id}.",
                "stock": None,
            })
        except Exception as e:
            logger.exception("Tool[check_product_stock] error: %s", e)
            raise ToolException(f"Stock check failed: {str(e)}")

    # ── Tool 4: get_compatible_products ─────────────────────────

    @tool("get_compatible_products", args_schema=GetCompatibleProductsInput)
    def get_compatible_products(
        problem_category: str,
        plant_species: Optional[str] = None,
    ) -> str:
        """
        Find products compatible with a specific plant problem and species.

        This tool queries the ProductCompatibility table to find products
        that are specifically designed or tested for the given problem
        category and plant species.

        A product is compatible if:
        - It has a compatibility entry matching the problem_category, AND
        - The compatibility entry has plant_species=NULL (universal) OR
          matches the given species.

        Use this AFTER search_products to find the most relevant products.
        """
        try:
            products = repo.get_compatible_products(
                problem_category=problem_category.lower().strip(),
                plant_species=plant_species,
            )

            logger.info(
                "Tool[get_compatible_products]: problem=%s, species=%s → %d products",
                problem_category, plant_species, len(products),
            )
            return _serialize_product_list(products)

        except Exception as e:
            logger.exception("Tool[get_compatible_products] error: %s", e)
            raise ToolException(f"Compatibility search failed: {str(e)}")

    return [search_products, get_product, check_product_stock, get_compatible_products]
