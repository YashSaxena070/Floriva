"""
Data access layer for Category, Product, and ProductCompatibility models.
"""

import uuid
from typing import Optional
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_

from app.models.product import Category, Product, ProductCompatibility


class ProductRepository:
    """Repository for product catalog CRUD operations."""

    def __init__(self, db: Session):
        self.db = db

    # ── Categories ───────────────────────────────────────────────

    def list_categories(self) -> list[Category]:
        """Fetch all categories, ordered by name."""
        return (
            self.db.query(Category)
            .order_by(Category.name)
            .all()
        )

    def get_category_by_slug(self, slug: str) -> Optional[Category]:
        """Fetch a category by its URL-safe slug."""
        return (
            self.db.query(Category)
            .filter(Category.slug == slug)
            .first()
        )

    def get_category_by_id(self, category_id: uuid.UUID) -> Optional[Category]:
        """Fetch a category by ID."""
        return (
            self.db.query(Category)
            .filter(Category.id == category_id)
            .first()
        )

    # ── Products ─────────────────────────────────────────────────

    def list_products(
        self,
        category_id: Optional[uuid.UUID] = None,
        active_only: bool = True,
    ) -> list[Product]:
        """
        Fetch products with optional category filter.
        Eager-loads category and compatibilities.
        """
        query = (
            self.db.query(Product)
            .options(
                joinedload(Product.category),
                joinedload(Product.compatibilities),
            )
        )
        if active_only:
            query = query.filter(Product.active == True)
        if category_id:
            query = query.filter(Product.category_id == category_id)

        return query.order_by(Product.name).all()

    def get_product_by_id(self, product_id: uuid.UUID) -> Optional[Product]:
        """Fetch a single product by ID with all relationships loaded."""
        return (
            self.db.query(Product)
            .options(
                joinedload(Product.category),
                joinedload(Product.compatibilities),
            )
            .filter(Product.id == product_id)
            .first()
        )

    def get_products_by_category_slugs(
        self,
        category_slugs: list[str],
        active_only: bool = True,
    ) -> list[Product]:
        """
        Fetch all products whose category slug is in the given list.
        Used by the recommendation pipeline's ProductQuery step.
        """
        query = (
            self.db.query(Product)
            .join(Product.category)
            .options(
                joinedload(Product.category),
                joinedload(Product.compatibilities),
            )
            .filter(Category.slug.in_(category_slugs))
        )
        if active_only:
            query = query.filter(Product.active == True)

        return query.order_by(Product.name).all()

    def get_compatible_products(
        self,
        problem_category: str,
        plant_species: Optional[str] = None,
    ) -> list[Product]:
        """
        Fetch products compatible with a specific problem category
        and optionally a plant species.

        A product is compatible if it has a ProductCompatibility entry where:
        - problem_category matches, AND
        - plant_species is NULL (universal) OR matches the given species
        """
        species_filter = or_(
            ProductCompatibility.plant_species == None,  # noqa: E711
        )
        if plant_species:
            species_filter = or_(
                ProductCompatibility.plant_species == None,  # noqa: E711
                ProductCompatibility.plant_species.ilike(f"%{plant_species}%"),
            )

        return (
            self.db.query(Product)
            .join(Product.compatibilities)
            .options(
                joinedload(Product.category),
                joinedload(Product.compatibilities),
            )
            .filter(
                and_(
                    ProductCompatibility.problem_category == problem_category,
                    species_filter,
                    Product.active == True,
                )
            )
            .distinct()
            .all()
        )

    def search_products(self, query_text: str) -> list[Product]:
        """Simple text search across product name and description."""
        pattern = f"%{query_text}%"
        return (
            self.db.query(Product)
            .options(
                joinedload(Product.category),
            )
            .filter(
                and_(
                    Product.active == True,
                    or_(
                        Product.name.ilike(pattern),
                        Product.description.ilike(pattern),
                        Product.brand.ilike(pattern),
                    ),
                )
            )
            .order_by(Product.name)
            .all()
        )
