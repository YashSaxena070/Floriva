"""
Seed script for product catalog — inserts realistic development products.

Run with: python -m app.scripts.seed_products

All seeded products are marked with is_seed_data=True so they can be
identified and cleaned up separately from real catalog data.

To reset: python -m app.scripts.seed_products --reset
"""

import sys
import uuid
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config.database import SessionLocal
from app.models.product import Category, Product, ProductCompatibility

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Category Definitions ────────────────────────────────────────

CATEGORIES = [
    {
        "name": "Fertilizer",
        "slug": "fertilizer",
        "description": "Plant nutrients and fertilizers for healthy growth.",
    },
    {
        "name": "Soil",
        "slug": "soil",
        "description": "Potting mixes and specialty soils for different plant types.",
    },
    {
        "name": "Soil Amendment",
        "slug": "soil_amendment",
        "description": "Perlite, vermiculite, and other soil additives.",
    },
    {
        "name": "Fungicide",
        "slug": "fungicide",
        "description": "Treatments for fungal diseases in plants.",
    },
    {
        "name": "Pest Control",
        "slug": "pest_control",
        "description": "Insecticides, miticides, and pest management solutions.",
    },
    {
        "name": "Plant Care",
        "slug": "plant_care",
        "description": "General plant care supplies — humidifiers, moisture meters, etc.",
    },
    {
        "name": "Gardening Tools",
        "slug": "gardening_tools",
        "description": "Pruning shears, watering cans, and essential gardening tools.",
    },
]


# ── Product Definitions ─────────────────────────────────────────
#
# Each product has: name, brand, price, stock, description,
# usage_instructions, category_slug, and compatibilities.

PRODUCTS = [
    # ── Fertilizer ──────────────────────────────────────────────
    {
        "name": "Miracle-Gro Indoor Plant Food 8oz",
        "brand": "Miracle-Gro",
        "price": 5.99,
        "stock": 120,
        "category_slug": "fertilizer",
        "description": "Liquid plant food for all indoor plants. Feeds instantly.",
        "usage_instructions": "Mix 1/2 teaspoon per quart of water. Apply every 2 weeks during growing season.",
        "image_url": "/images/products/miracle-gro-indoor.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Osmocote Smart-Release Plant Food 1lb",
        "brand": "Osmocote",
        "price": 9.49,
        "stock": 85,
        "category_slug": "fertilizer",
        "description": "Slow-release granular fertilizer that feeds up to 4 months.",
        "usage_instructions": "Sprinkle 1 tablespoon per 4-inch pot. Mix into top inch of soil. Water thoroughly.",
        "image_url": "/images/products/osmocote-smart.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Fox Farm Big Bloom Liquid Fertilizer 1qt",
        "brand": "Fox Farm",
        "price": 18.99,
        "stock": 45,
        "category_slug": "fertilizer",
        "description": "Organic liquid fertilizer with earthworm castings and bat guano.",
        "usage_instructions": "Mix 2 tablespoons per gallon. Use every watering during flowering.",
        "image_url": "/images/products/foxfarm-bigbloom.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Schultz Cactus Plus Liquid Plant Food 4oz",
        "brand": "Schultz",
        "price": 4.99,
        "stock": 65,
        "category_slug": "fertilizer",
        "description": "Specially formulated for cacti and succulents. Micronutrient enriched.",
        "usage_instructions": "7 drops per quart of water. Feed every time you water.",
        "image_url": "/images/products/schultz-cactus.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
        ],
    },
    {
        "name": "EarthPods Premium Indoor Plant Food (100 capsules)",
        "brand": "EarthPods",
        "price": 14.99,
        "stock": 55,
        "category_slug": "fertilizer",
        "description": "Push-and-forget fertilizer capsules. Organic, slow-release nutrition.",
        "usage_instructions": "Push 1-2 capsules into soil near the root zone. Water normally. Reapply monthly.",
        "image_url": "/images/products/earthpods-indoor.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },

    # ── Soil ────────────────────────────────────────────────────
    {
        "name": "Miracle-Gro Indoor Potting Mix 6qt",
        "brand": "Miracle-Gro",
        "price": 7.99,
        "stock": 95,
        "category_slug": "soil",
        "description": "Designed for indoor containers. Less prone to gnats. Feeds up to 6 months.",
        "usage_instructions": "Fill pot 1/3 full. Place plant. Fill around root ball. Water thoroughly.",
        "image_url": "/images/products/miraclegro-indoor-soil.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Hoffman Organic Cactus & Succulent Mix 4qt",
        "brand": "Hoffman",
        "price": 6.49,
        "stock": 70,
        "category_slug": "soil",
        "description": "Fast-draining mix for cacti and succulents. Contains sand, perlite, peat.",
        "usage_instructions": "Use as-is for cacti and succulents. Ensure pot has drainage holes.",
        "image_url": "/images/products/hoffman-cactus-mix.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
        ],
    },
    {
        "name": "rePotme Orchid Bark Mix Premium 4qt",
        "brand": "rePotme",
        "price": 16.99,
        "stock": 30,
        "category_slug": "soil",
        "description": "Premium orchid bark mix with charcoal and sponge rock. Excellent drainage.",
        "usage_instructions": "Soak bark in water for 10 minutes before use. Repot orchids every 1-2 years.",
        "image_url": "/images/products/repotme-orchid-bark.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
        ],
    },
    {
        "name": "FoxFarm Ocean Forest Potting Soil 12qt",
        "brand": "Fox Farm",
        "price": 19.99,
        "stock": 40,
        "category_slug": "soil",
        "description": "Powerfully rich organic soil blend. Aged forest products, earthworm castings, bat guano.",
        "usage_instructions": "Ready to use. Fill containers and transplant. pH adjusted for optimal growth.",
        "image_url": "/images/products/foxfarm-ocean-forest.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },

    # ── Soil Amendment ──────────────────────────────────────────
    {
        "name": "Espoma Organic Perlite 8qt",
        "brand": "Espoma",
        "price": 6.99,
        "stock": 80,
        "category_slug": "soil_amendment",
        "description": "Lightweight volcanic glass that improves drainage and aeration.",
        "usage_instructions": "Mix 1 part perlite to 3-4 parts potting soil. Use for all container plants.",
        "image_url": "/images/products/espoma-perlite.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
        ],
    },
    {
        "name": "Hoffman Horticultural Charcoal 2qt",
        "brand": "Hoffman",
        "price": 8.49,
        "stock": 55,
        "category_slug": "soil_amendment",
        "description": "Improves drainage and absorbs impurities. Essential for terrariums.",
        "usage_instructions": "Add a thin layer at the bottom of pots or mix into soil at 10% ratio.",
        "image_url": "/images/products/hoffman-charcoal.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
        ],
    },
    {
        "name": "Worm Castings Organic Fertilizer 5lb",
        "brand": "Unco Industries",
        "price": 12.99,
        "stock": 40,
        "category_slug": "soil_amendment",
        "description": "Pure earthworm castings. Improves soil structure, adds nutrients naturally.",
        "usage_instructions": "Mix 1/4 cup into top soil for established plants. Add to potting mix at 20% ratio.",
        "image_url": "/images/products/worm-castings.jpg",
        "compatibilities": [
            {"problem_category": "nutrient_deficiency", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },

    # ── Fungicide ───────────────────────────────────────────────
    {
        "name": "Bonide Copper Fungicide RTU 32oz",
        "brand": "Bonide",
        "price": 12.99,
        "stock": 60,
        "category_slug": "fungicide",
        "description": "Ready-to-use copper fungicide. Controls powdery mildew, black spot, rust, and blight.",
        "usage_instructions": "Spray all plant surfaces until dripping wet. Repeat every 7-10 days. Apply in morning.",
        "image_url": "/images/products/bonide-copper.jpg",
        "compatibilities": [
            {"problem_category": "fungal_disease", "plant_species": None},
            {"problem_category": "bacterial_disease", "plant_species": None},
        ],
    },
    {
        "name": "Garden Safe Neem Oil Extract 16oz",
        "brand": "Garden Safe",
        "price": 9.99,
        "stock": 90,
        "category_slug": "fungicide",
        "description": "3-in-1 organic treatment: fungicide, insecticide, and miticide.",
        "usage_instructions": "Mix 2 tbsp per gallon of water. Spray all leaf surfaces. Apply every 7-14 days.",
        "image_url": "/images/products/garden-safe-neem.jpg",
        "compatibilities": [
            {"problem_category": "fungal_disease", "plant_species": None},
            {"problem_category": "pest_infestation", "plant_species": None},
        ],
    },
    {
        "name": "Southern Ag Liquid Copper Fungicide 16oz",
        "brand": "Southern Ag",
        "price": 14.49,
        "stock": 35,
        "category_slug": "fungicide",
        "description": "Concentrated copper fungicide for serious fungal infections. Organic OMRI listed.",
        "usage_instructions": "Mix 1.5-3 tbsp per gallon. Apply as foliar spray. Repeat every 7-10 days.",
        "image_url": "/images/products/southern-ag-copper.jpg",
        "compatibilities": [
            {"problem_category": "fungal_disease", "plant_species": None},
            {"problem_category": "bacterial_disease", "plant_species": None},
        ],
    },
    {
        "name": "BioAdvanced Disease Control for Roses 32oz",
        "brand": "BioAdvanced",
        "price": 19.99,
        "stock": 25,
        "category_slug": "fungicide",
        "description": "Systemic fungicide specifically for roses. Controls black spot, powdery mildew, rust.",
        "usage_instructions": "Spray upper and lower leaf surfaces. Repeat every 14 days during disease season.",
        "image_url": "/images/products/bioadvanced-rose.jpg",
        "compatibilities": [
            {"problem_category": "fungal_disease", "plant_species": "Rose"},
            {"problem_category": "fungal_disease", "plant_species": None},
        ],
    },
    {
        "name": "Monterey Complete Disease Control 32oz",
        "brand": "Monterey",
        "price": 24.99,
        "stock": 20,
        "category_slug": "fungicide",
        "description": "Biofungicide using Bacillus amyloliquefaciens. Controls 25+ diseases organically.",
        "usage_instructions": "Mix 2-4 oz per gallon. Apply as foliar spray or soil drench. Safe for edibles.",
        "image_url": "/images/products/monterey-disease-control.jpg",
        "compatibilities": [
            {"problem_category": "fungal_disease", "plant_species": None},
            {"problem_category": "bacterial_disease", "plant_species": None},
            {"problem_category": "root_rot", "plant_species": None},
        ],
    },

    # ── Pest Control ────────────────────────────────────────────
    {
        "name": "Safer Brand Insecticidal Soap 32oz RTU",
        "brand": "Safer Brand",
        "price": 8.99,
        "stock": 100,
        "category_slug": "pest_control",
        "description": "Kills aphids, mealybugs, whiteflies, and spider mites on contact.",
        "usage_instructions": "Spray directly on pests. Cover all surfaces. Repeat every 5-7 days as needed.",
        "image_url": "/images/products/safer-soap.jpg",
        "compatibilities": [
            {"problem_category": "pest_infestation", "plant_species": None},
        ],
    },
    {
        "name": "Bonide Systemic Insect Control Granules 4lb",
        "brand": "Bonide",
        "price": 15.99,
        "stock": 50,
        "category_slug": "pest_control",
        "description": "Systemic protection absorbed through roots. Protects for up to 8 weeks.",
        "usage_instructions": "Sprinkle granules on soil surface. Water in thoroughly. Reapply every 8 weeks.",
        "image_url": "/images/products/bonide-systemic.jpg",
        "compatibilities": [
            {"problem_category": "pest_infestation", "plant_species": None},
        ],
    },
    {
        "name": "Captain Jack's Dead Bug Brew 32oz",
        "brand": "Bonide",
        "price": 11.99,
        "stock": 65,
        "category_slug": "pest_control",
        "description": "Spinosad-based organic insecticide. Kills caterpillars, beetles, thrips, and more.",
        "usage_instructions": "Spray all plant surfaces. Apply in evening. Repeat every 7-10 days.",
        "image_url": "/images/products/captain-jacks.jpg",
        "compatibilities": [
            {"problem_category": "pest_infestation", "plant_species": None},
        ],
    },
    {
        "name": "BioAdvanced 3-in-1 Insect, Disease & Mite Control 24oz",
        "brand": "BioAdvanced",
        "price": 14.49,
        "stock": 40,
        "category_slug": "pest_control",
        "description": "Controls insects, diseases, and mites with one product. For indoor and outdoor use.",
        "usage_instructions": "Shake well. Spray all plant surfaces until wet. Reapply every 7 days.",
        "image_url": "/images/products/bioadvanced-3in1.jpg",
        "compatibilities": [
            {"problem_category": "pest_infestation", "plant_species": None},
            {"problem_category": "fungal_disease", "plant_species": None},
        ],
    },
    {
        "name": "Natria Insecticidal Soap RTU 24oz",
        "brand": "Natria",
        "price": 7.49,
        "stock": 75,
        "category_slug": "pest_control",
        "description": "Potassium salts of fatty acids. Kills soft-bodied insects on contact. OMRI listed.",
        "usage_instructions": "Spray directly on insects. Ensure full coverage. Safe for use up to day of harvest.",
        "image_url": "/images/products/natria-soap.jpg",
        "compatibilities": [
            {"problem_category": "pest_infestation", "plant_species": None},
        ],
    },

    # ── Plant Care ──────────────────────────────────────────────
    {
        "name": "Aqua Globes Glass Watering Bulbs (2-pack)",
        "brand": "Aqua Globes",
        "price": 9.99,
        "stock": 50,
        "category_slug": "plant_care",
        "description": "Self-watering globes that release water slowly. Perfect for vacation care.",
        "usage_instructions": "Fill with water. Insert into moist soil at an angle. Refill every 1-2 weeks.",
        "image_url": "/images/products/aqua-globes.jpg",
        "compatibilities": [
            {"problem_category": "underwatering", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "XLUX Soil Moisture Meter",
        "brand": "XLUX",
        "price": 12.99,
        "stock": 80,
        "category_slug": "plant_care",
        "description": "No batteries needed. Instant moisture reading. Prevents over and underwatering.",
        "usage_instructions": "Insert probe into soil near root zone. Read moisture level. Water accordingly.",
        "image_url": "/images/products/xlux-moisture.jpg",
        "compatibilities": [
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "underwatering", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Pure Enrichment MistAire Humidifier",
        "brand": "Pure Enrichment",
        "price": 29.99,
        "stock": 25,
        "category_slug": "plant_care",
        "description": "Ultrasonic cool mist humidifier. Runs up to 25 hours. Perfect for tropical plants.",
        "usage_instructions": "Fill tank with water. Set mist direction toward plants. Clean weekly.",
        "image_url": "/images/products/pure-enrichment-humidifier.jpg",
        "compatibilities": [
            {"problem_category": "environmental_stress", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Hydrogen Peroxide 3% Solution 32oz",
        "brand": "Swan",
        "price": 3.99,
        "stock": 150,
        "category_slug": "plant_care",
        "description": "Multipurpose plant care solution. Treats root rot and aerates soil.",
        "usage_instructions": "Mix 1 part H2O2 to 4 parts water. Use as soil drench for root rot treatment.",
        "image_url": "/images/products/hydrogen-peroxide.jpg",
        "compatibilities": [
            {"problem_category": "root_rot", "plant_species": None},
            {"problem_category": "overwatering", "plant_species": None},
            {"problem_category": "fungal_disease", "plant_species": None},
        ],
    },
    {
        "name": "Superthrive Plant Vitamin Solution 4oz",
        "brand": "Superthrive",
        "price": 8.99,
        "stock": 60,
        "category_slug": "plant_care",
        "description": "Vitamin-hormone supplement for stressed and transplanted plants.",
        "usage_instructions": "Add 1/4 tsp per gallon of water. Use after repotting or during recovery.",
        "image_url": "/images/products/superthrive.jpg",
        "compatibilities": [
            {"problem_category": "environmental_stress", "plant_species": None},
            {"problem_category": "healthy", "plant_species": None},
        ],
    },

    # ── Gardening Tools ─────────────────────────────────────────
    {
        "name": "Fiskars Micro-Tip Pruning Snips",
        "brand": "Fiskars",
        "price": 13.99,
        "stock": 70,
        "category_slug": "gardening_tools",
        "description": "Precision pruning for deadheading, trimming, and shaping. Stainless steel.",
        "usage_instructions": "Sterilize before each use. Cut at 45° angle just above a leaf node.",
        "image_url": "/images/products/fiskars-snips.jpg",
        "compatibilities": [
            {"problem_category": "healthy", "plant_species": None},
            {"problem_category": "fungal_disease", "plant_species": None},
        ],
    },
    {
        "name": "Haws Indoor Watering Can 1L",
        "brand": "Haws",
        "price": 24.99,
        "stock": 30,
        "category_slug": "gardening_tools",
        "description": "Long-spout brass watering can. Precision watering for indoor plants.",
        "usage_instructions": "Fill with room temperature water. Direct spout at soil base, not leaves.",
        "image_url": "/images/products/haws-watering-can.jpg",
        "compatibilities": [
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Vivosun Pruning Shears",
        "brand": "Vivosun",
        "price": 7.99,
        "stock": 90,
        "category_slug": "gardening_tools",
        "description": "Bypass pruning shears with safety lock. Comfortable grip for extended use.",
        "usage_instructions": "Use for stems up to 3/4 inch. Clean and oil after each use.",
        "image_url": "/images/products/vivosun-shears.jpg",
        "compatibilities": [
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
    {
        "name": "Gardening Gloves with Claws (pair)",
        "brand": "Garden Genie",
        "price": 6.99,
        "stock": 100,
        "category_slug": "gardening_tools",
        "description": "Waterproof gloves with built-in digging claws. Protects hands from chemicals.",
        "usage_instructions": "Wear when handling soil, fertilizer, or chemicals. Rinse after use.",
        "image_url": "/images/products/garden-genie-gloves.jpg",
        "compatibilities": [
            {"problem_category": "healthy", "plant_species": None},
        ],
    },
]


def seed_categories(db: Session) -> dict[str, uuid.UUID]:
    """Insert categories and return slug → id mapping."""
    slug_to_id: dict[str, uuid.UUID] = {}

    for cat_data in CATEGORIES:
        existing = db.query(Category).filter(Category.slug == cat_data["slug"]).first()
        if existing:
            slug_to_id[cat_data["slug"]] = existing.id
            logger.info("  Category '%s' already exists, skipping.", cat_data["name"])
            continue

        category = Category(
            name=cat_data["name"],
            slug=cat_data["slug"],
            description=cat_data["description"],
        )
        db.add(category)
        db.flush()
        slug_to_id[cat_data["slug"]] = category.id
        logger.info("  Created category: %s", cat_data["name"])

    return slug_to_id


def seed_products(db: Session, slug_to_id: dict[str, uuid.UUID]) -> int:
    """Insert products and their compatibilities. Returns count inserted."""
    count = 0

    for prod_data in PRODUCTS:
        category_slug = prod_data["category_slug"]
        category_id = slug_to_id.get(category_slug)
        if not category_id:
            logger.warning("  Unknown category slug: %s — skipping %s", category_slug, prod_data["name"])
            continue

        # Check if product already exists (by name + brand)
        existing = (
            db.query(Product)
            .filter(Product.name == prod_data["name"], Product.brand == prod_data["brand"])
            .first()
        )
        if existing:
            logger.info("  Product '%s' already exists, skipping.", prod_data["name"])
            continue

        product = Product(
            name=prod_data["name"],
            brand=prod_data["brand"],
            price=prod_data["price"],
            stock=prod_data["stock"],
            category_id=category_id,
            description=prod_data["description"],
            usage_instructions=prod_data["usage_instructions"],
            image_url=prod_data.get("image_url"),
            active=True,
            is_seed_data=True,
        )
        db.add(product)
        db.flush()

        # Add compatibilities
        for compat_data in prod_data.get("compatibilities", []):
            compat = ProductCompatibility(
                product_id=product.id,
                problem_category=compat_data["problem_category"],
                plant_species=compat_data.get("plant_species"),
            )
            db.add(compat)

        count += 1
        logger.info("  Created product: %s (%s) — $%.2f", prod_data["name"], prod_data["brand"], prod_data["price"])

    return count


def reset_seed_data(db: Session) -> int:
    """Delete all products and categories marked as seed data."""
    # Delete seed products (cascades to compatibilities)
    deleted = db.query(Product).filter(Product.is_seed_data == True).delete()
    db.commit()
    logger.info("Deleted %d seed products.", deleted)
    return deleted


def main():
    """Run the seed script."""
    reset = "--reset" in sys.argv

    db = SessionLocal()
    try:
        if reset:
            logger.info("Resetting seed data...")
            reset_seed_data(db)
            logger.info("Reset complete.\n")

        logger.info("Seeding product catalog...")

        logger.info("\n── Categories ──")
        slug_to_id = seed_categories(db)
        logger.info("Categories: %d total\n", len(slug_to_id))

        logger.info("── Products ──")
        count = seed_products(db, slug_to_id)
        logger.info("\nProducts seeded: %d", count)

        db.commit()
        logger.info("\nSeed complete! All products marked with is_seed_data=True.")

    except Exception as e:
        db.rollback()
        logger.exception("Seed failed: %s", str(e))
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
