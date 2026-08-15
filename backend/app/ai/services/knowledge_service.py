"""
Knowledge service — provides curated plant care data to augment LLM prompts.

This is the abstraction layer between raw LLM prompting and actual
plant knowledge. Instead of relying entirely on the LLM's internal
knowledge for care/treatment recommendations, we inject validated
reference data into the prompt.

CURRENT (v1): Embedded knowledge base — a dictionary of common plant
families and species with validated care baselines and disease profiles.

FUTURE (v2): Replace the embedded dict with a vector store / RAG lookup.
The KnowledgeService interface stays the same, so the swap is transparent
to the AI analysis pipeline.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Embedded Plant Knowledge Base ────────────────────────────────
#
# Structured by plant family, with species-level overrides where relevant.
# Care values represent general baselines that the LLM should refine
# based on the specific plant image and health context.

PLANT_KNOWLEDGE_BASE: dict = {
    # ── Araceae (Pothos, Philodendron, Monstera, etc.) ─────────
    "araceae": {
        "family": "Araceae",
        "common_members": ["Pothos", "Philodendron", "Monstera", "Alocasia", "Anthurium"],
        "care_baseline": {
            "watering": "Water when top 1-2 inches of soil are dry. Typically every 7-10 days.",
            "sunlight": "Bright indirect light. Tolerates low light but growth slows.",
            "temperature": "65-85°F (18-29°C). Avoid cold drafts below 55°F.",
            "humidity": "Prefers 50-70% humidity. Mist regularly or use a pebble tray.",
            "soil": "Well-draining potting mix with perlite or orchid bark.",
            "fertilization": "Balanced liquid fertilizer monthly during growing season (spring-summer).",
            "pruning": "Trim yellowing or damaged leaves. Prune leggy growth to encourage bushiness.",
        },
        "common_issues": [
            {"name": "Root rot", "category": "overwatering", "signs": ["yellowing leaves", "mushy stems", "foul soil smell"]},
            {"name": "Leaf spot", "category": "fungal_disease", "signs": ["brown or black spots on leaves"]},
            {"name": "Spider mites", "category": "pest_infestation", "signs": ["tiny webbing", "speckled leaves"]},
        ],
    },

    # ── Asparagaceae (Snake Plant, Dracaena, etc.) ─────────────
    "asparagaceae": {
        "family": "Asparagaceae",
        "common_members": ["Snake Plant", "Dracaena", "Asparagus Fern", "Spider Plant"],
        "care_baseline": {
            "watering": "Water every 2-3 weeks. Allow soil to dry completely between waterings.",
            "sunlight": "Low to bright indirect light. Very tolerant of low-light conditions.",
            "temperature": "60-85°F (15-29°C). Avoid temperatures below 50°F.",
            "humidity": "Tolerates low humidity. Average room humidity is fine.",
            "soil": "Well-draining cactus/succulent mix or regular potting mix with extra perlite.",
            "fertilization": "Fertilize sparingly — once or twice during growing season.",
            "pruning": "Remove dead or damaged leaves at the base. Minimal pruning needed.",
        },
        "common_issues": [
            {"name": "Overwatering rot", "category": "overwatering", "signs": ["soft mushy leaves", "brown base"]},
            {"name": "Mealybugs", "category": "pest_infestation", "signs": ["white cottony masses on leaves"]},
        ],
    },

    # ── Cactaceae (Cacti) ──────────────────────────────────────
    "cactaceae": {
        "family": "Cactaceae",
        "common_members": ["Prickly Pear", "Barrel Cactus", "Christmas Cactus", "Saguaro"],
        "care_baseline": {
            "watering": "Water sparingly every 2-4 weeks. Let soil dry completely. Reduce in winter.",
            "sunlight": "Full sun to bright direct light. At least 4-6 hours daily.",
            "temperature": "70-100°F (21-38°C) daytime. Tolerates cooler nights.",
            "humidity": "Low humidity preferred. Avoid misting.",
            "soil": "Fast-draining cactus mix with coarse sand and perlite.",
            "fertilization": "Diluted cactus fertilizer once monthly during growing season only.",
            "pruning": "Minimal. Remove dead or damaged segments with sterile tools.",
        },
        "common_issues": [
            {"name": "Root rot", "category": "overwatering", "signs": ["soft discolored base", "mushy tissue"]},
            {"name": "Scale insects", "category": "pest_infestation", "signs": ["brown bumps on surface"]},
            {"name": "Sunburn", "category": "sunburn", "signs": ["white or brown patches on sun-facing side"]},
        ],
    },

    # ── Orchidaceae (Orchids) ──────────────────────────────────
    "orchidaceae": {
        "family": "Orchidaceae",
        "common_members": ["Phalaenopsis", "Dendrobium", "Cattleya", "Oncidium"],
        "care_baseline": {
            "watering": "Water weekly by soaking roots. Allow to drain completely. Never let roots sit in water.",
            "sunlight": "Bright indirect light. East or south-facing window with filtered light.",
            "temperature": "65-80°F (18-27°C) daytime, 55-65°F at night for blooming.",
            "humidity": "60-80% humidity ideal. Use humidity tray or room humidifier.",
            "soil": "Orchid bark mix, sphagnum moss, or LECA. Never regular potting soil.",
            "fertilization": "Weakly, weekly — diluted orchid fertilizer at 1/4 strength every watering.",
            "pruning": "Cut spent flower spikes above a node. Remove dead roots during repotting.",
        },
        "common_issues": [
            {"name": "Crown rot", "category": "fungal_disease", "signs": ["black mushy crown", "leaf drop"]},
            {"name": "Bacterial brown spot", "category": "bacterial_disease", "signs": ["watery brown lesions on leaves"]},
            {"name": "Scale insects", "category": "pest_infestation", "signs": ["small brown bumps on leaves/stems"]},
        ],
    },

    # ── Rosaceae (Roses) ──────────────────────────────────────
    "rosaceae": {
        "family": "Rosaceae",
        "common_members": ["Rose", "Apple", "Cherry", "Strawberry"],
        "care_baseline": {
            "watering": "Deep watering 2-3 times per week. Water at the base, avoid wetting leaves.",
            "sunlight": "Full sun — at least 6 hours of direct sunlight daily.",
            "temperature": "60-75°F (15-24°C). Hardy in many climates with winter dormancy.",
            "humidity": "Moderate humidity. Good air circulation prevents fungal issues.",
            "soil": "Rich, loamy, well-draining soil. pH 6.0-6.5. Mulch to retain moisture.",
            "fertilization": "Rose-specific fertilizer every 4-6 weeks during growing season.",
            "pruning": "Prune in late winter/early spring. Remove dead wood and shape plant.",
        },
        "common_issues": [
            {"name": "Black spot", "category": "fungal_disease", "signs": ["black spots on leaves", "yellowing leaves"]},
            {"name": "Powdery mildew", "category": "fungal_disease", "signs": ["white powdery coating on leaves"]},
            {"name": "Aphids", "category": "pest_infestation", "signs": ["clusters of small insects on new growth"]},
            {"name": "Rust", "category": "fungal_disease", "signs": ["orange-red pustules on leaf undersides"]},
        ],
    },

    # ── Crassulaceae (Succulents) ─────────────────────────────
    "crassulaceae": {
        "family": "Crassulaceae",
        "common_members": ["Echeveria", "Jade Plant", "Sedum", "Kalanchoe"],
        "care_baseline": {
            "watering": "Water every 1-2 weeks. Soak and dry method. Reduce in winter.",
            "sunlight": "Bright direct or indirect light. 4-6 hours daily.",
            "temperature": "60-80°F (15-27°C). Most are not frost-hardy.",
            "humidity": "Low humidity preferred. Good air circulation essential.",
            "soil": "Well-draining succulent/cactus mix. Add extra perlite or pumice.",
            "fertilization": "Diluted succulent fertilizer once monthly in growing season.",
            "pruning": "Remove dead lower leaves. Behead leggy plants to propagate.",
        },
        "common_issues": [
            {"name": "Etiolation", "category": "environmental_stress", "signs": ["stretched pale growth", "leaning toward light"]},
            {"name": "Root rot", "category": "overwatering", "signs": ["translucent mushy leaves", "black stems"]},
            {"name": "Mealybugs", "category": "pest_infestation", "signs": ["white cottony masses in leaf crevices"]},
        ],
    },

    # ── Fabaceae (Legumes, Ficus) ─────────────────────────────
    "moraceae": {
        "family": "Moraceae",
        "common_members": ["Fiddle Leaf Fig", "Rubber Plant", "Weeping Fig", "Ficus"],
        "care_baseline": {
            "watering": "Water when top inch of soil is dry. Typically weekly. Sensitive to overwatering.",
            "sunlight": "Bright indirect light. Fiddle Leaf Figs need consistent light.",
            "temperature": "60-80°F (15-27°C). Avoid cold drafts and sudden temperature changes.",
            "humidity": "Prefers 40-60% humidity. Mist in dry conditions.",
            "soil": "Well-draining potting mix with perlite. Slightly acidic preferred.",
            "fertilization": "Balanced liquid fertilizer monthly during spring and summer.",
            "pruning": "Prune to shape. Notching can encourage branching in Fiddle Leaf Figs.",
        },
        "common_issues": [
            {"name": "Leaf drop", "category": "environmental_stress", "signs": ["sudden leaf loss", "triggered by move or draft"]},
            {"name": "Brown spots", "category": "bacterial_disease", "signs": ["dark brown spots on leaves"]},
            {"name": "Root rot", "category": "overwatering", "signs": ["yellowing lower leaves", "soggy soil"]},
        ],
    },

    # ── Marantaceae (Prayer Plants) ───────────────────────────
    "marantaceae": {
        "family": "Marantaceae",
        "common_members": ["Prayer Plant", "Calathea", "Stromanthe", "Ctenanthe"],
        "care_baseline": {
            "watering": "Keep soil consistently moist but not waterlogged. Use filtered water.",
            "sunlight": "Medium to low indirect light. Avoid direct sun — leaves will burn.",
            "temperature": "65-80°F (18-27°C). Very sensitive to cold.",
            "humidity": "High humidity essential — 60%+. Use humidifier or group plants.",
            "soil": "Rich, well-draining mix with peat and perlite.",
            "fertilization": "Diluted balanced fertilizer every 2-4 weeks in growing season.",
            "pruning": "Remove brown or crispy leaves. Trim at the base of the stem.",
        },
        "common_issues": [
            {"name": "Crispy leaf edges", "category": "environmental_stress", "signs": ["brown crispy leaf margins"]},
            {"name": "Spider mites", "category": "pest_infestation", "signs": ["fine webbing", "stippled leaves"]},
            {"name": "Leaf curl", "category": "underwatering", "signs": ["leaves curling inward"]},
        ],
    },

    # ── Solanaceae (Tomato, Pepper, etc.) ─────────────────────
    "solanaceae": {
        "family": "Solanaceae",
        "common_members": ["Tomato", "Pepper", "Eggplant", "Petunia"],
        "care_baseline": {
            "watering": "Regular deep watering. Keep soil consistently moist. 1-2 inches per week.",
            "sunlight": "Full sun — 8+ hours of direct sunlight for fruiting varieties.",
            "temperature": "70-85°F (21-29°C). Frost-sensitive.",
            "humidity": "Moderate humidity. Good air circulation prevents blight.",
            "soil": "Rich, well-draining soil amended with compost. pH 6.0-6.8.",
            "fertilization": "Tomato/vegetable fertilizer every 2 weeks during fruiting.",
            "pruning": "Remove suckers on tomatoes. Pinch back peppers for bushier growth.",
        },
        "common_issues": [
            {"name": "Early blight", "category": "fungal_disease", "signs": ["concentric ring spots on lower leaves"]},
            {"name": "Late blight", "category": "fungal_disease", "signs": ["water-soaked lesions", "white mold on undersides"]},
            {"name": "Blossom end rot", "category": "nutrient_deficiency", "signs": ["dark sunken area at fruit bottom"]},
            {"name": "Hornworms", "category": "pest_infestation", "signs": ["large green caterpillars", "defoliation"]},
        ],
    },
}

# ── Treatment Knowledge Base ────────────────────────────────────
#
# Treatment protocols organized by problem category.

TREATMENT_KNOWLEDGE_BASE: dict = {
    "fungal_disease": {
        "general_approach": "Isolate affected plant. Remove infected parts. Improve air circulation.",
        "product_categories": ["fungicide", "neem_oil", "copper_spray"],
        "common_treatments": [
            "Apply neem oil solution (1 tbsp per quart of water) every 7-14 days",
            "Use copper-based fungicide as directed on label",
            "Remove and dispose of severely infected leaves",
            "Improve air circulation around the plant",
            "Avoid overhead watering — water at the base",
        ],
        "precautions": [
            "Wear gloves when handling fungicides",
            "Test spray on a small area first",
            "Do not apply in direct sunlight — treat in morning or evening",
            "Keep fungicides away from edible plant parts near harvest",
        ],
    },
    "bacterial_disease": {
        "general_approach": "Remove infected tissue promptly. Sterilize tools. Improve drainage.",
        "product_categories": ["copper_bactericide", "hydrogen_peroxide"],
        "common_treatments": [
            "Remove infected leaves/stems with sterile tools",
            "Apply copper-based bactericide",
            "Reduce watering frequency to prevent spread",
            "Improve drainage and air circulation",
        ],
        "precautions": [
            "Sterilize pruning tools between cuts with 70% alcohol",
            "Do not compost infected plant material",
            "Wash hands after handling infected plants",
        ],
    },
    "viral_disease": {
        "general_approach": "No cure for plant viruses. Manage symptoms and prevent spread.",
        "product_categories": ["none"],
        "common_treatments": [
            "Remove severely infected plants to prevent spread",
            "Control insect vectors (aphids, whiteflies) that spread viruses",
            "Maintain plant vigor with proper nutrition",
            "Do not propagate from infected plants",
        ],
        "precautions": [
            "Sterilize all tools after working with infected plants",
            "Monitor nearby plants for symptoms",
        ],
    },
    "pest_infestation": {
        "general_approach": "Identify the pest. Start with least-toxic methods. Isolate infested plant.",
        "product_categories": ["insecticidal_soap", "neem_oil", "systemic_insecticide"],
        "common_treatments": [
            "Spray with insecticidal soap, covering all surfaces",
            "Apply neem oil solution every 7-14 days",
            "For severe infestations, use systemic insecticide",
            "Manually remove visible pests with cotton swab dipped in alcohol",
            "Introduce beneficial insects (ladybugs) for outdoor plants",
        ],
        "precautions": [
            "Test any spray on a small leaf area first",
            "Treat in early morning or evening to avoid leaf burn",
            "Keep treated plants away from pets",
            "Repeat treatment 2-3 times to break pest lifecycle",
        ],
    },
    "nutrient_deficiency": {
        "general_approach": "Test soil. Apply targeted fertilizer. Adjust pH if needed.",
        "product_categories": ["balanced_fertilizer", "micronutrient_supplement", "soil_amendment"],
        "common_treatments": [
            "Apply balanced slow-release fertilizer",
            "For specific deficiencies, use targeted supplements (iron, calcium, magnesium)",
            "Adjust soil pH — most plants prefer 6.0-7.0",
            "Add compost or worm castings for organic nutrition",
        ],
        "precautions": [
            "Do not over-fertilize — can cause root burn",
            "Water thoroughly before applying fertilizer",
            "Follow product dosage instructions precisely",
        ],
    },
    "overwatering": {
        "general_approach": "Reduce watering immediately. Check for root rot. Improve drainage.",
        "product_categories": ["well_draining_soil", "hydrogen_peroxide"],
        "common_treatments": [
            "Stop watering and allow soil to dry out",
            "Remove plant from pot and inspect roots",
            "Trim any brown or mushy roots with sterile scissors",
            "Repot in fresh well-draining soil mix",
            "Treat remaining roots with 3% hydrogen peroxide solution",
            "Ensure pot has adequate drainage holes",
        ],
        "precautions": [
            "Do not fertilize a waterlogged plant",
            "Allow the plant to recover in indirect light",
            "Resume watering only when soil is dry to the touch",
        ],
    },
    "underwatering": {
        "general_approach": "Rehydrate gradually. Do not soak suddenly.",
        "product_categories": ["none"],
        "common_treatments": [
            "Water slowly and deeply, allowing soil to absorb",
            "For severely dry soil, bottom-water by placing pot in a tray of water for 20-30 minutes",
            "Mist leaves to reduce transpiration stress",
            "Resume regular watering schedule",
            "Add mulch to retain soil moisture",
        ],
        "precautions": [
            "Avoid flooding a severely dehydrated plant",
            "Drooping leaves should recover within hours of proper watering",
        ],
    },
    "environmental_stress": {
        "general_approach": "Identify and remove the stressor. Gradual acclimatization.",
        "product_categories": ["none"],
        "common_treatments": [
            "Move plant away from drafts, heaters, or AC vents",
            "Provide consistent lighting — avoid sudden changes",
            "Acclimatize to new environments gradually over 1-2 weeks",
            "Maintain stable temperature within the plant's preferred range",
            "Increase humidity if leaf edges are brown and crispy",
        ],
        "precautions": [
            "Avoid moving plants frequently",
            "Transition from indoor to outdoor light gradually",
        ],
    },
    "sunburn": {
        "general_approach": "Move to indirect light. Damaged tissue won't recover but new growth will be healthy.",
        "product_categories": ["none"],
        "common_treatments": [
            "Move plant to a location with filtered or indirect light",
            "Remove severely burnt leaves if they are more than 50% damaged",
            "Gradually introduce brighter light over 1-2 weeks if needed",
            "Ensure adequate watering — sun-stressed plants dehydrate faster",
        ],
        "precautions": [
            "Do not move from shade to full sun suddenly",
            "Morning sun is gentler than afternoon sun",
        ],
    },
    "root_rot": {
        "general_approach": "Emergency repotting. Remove all rotted roots. Reduce watering.",
        "product_categories": ["fungicide", "hydrogen_peroxide", "well_draining_soil"],
        "common_treatments": [
            "Unpot the plant and wash all soil off roots",
            "Cut away all brown, mushy, or foul-smelling roots with sterile scissors",
            "Soak remaining healthy roots in 3% hydrogen peroxide for 10 minutes",
            "Allow roots to air dry for 1-2 hours",
            "Repot in fresh, well-draining soil in a clean pot with drainage",
            "Water lightly and place in indirect light",
        ],
        "precautions": [
            "Discard old soil — do not reuse",
            "Clean and disinfect the pot before reusing",
            "Do not fertilize for at least 4 weeks after repotting",
            "Monitor closely — root rot can recur if overwatering resumes",
        ],
    },
}


class KnowledgeService:
    """
    Abstraction for plant care knowledge retrieval.

    Provides curated, validated knowledge to augment LLM prompts.
    The LLM receives this as "reference data" alongside the plant's
    specific context (species, health status, symptoms).

    Current implementation: Embedded dictionary lookup.
    Future implementation: Vector store / RAG retrieval.
    """

    async def get_plant_knowledge(
        self,
        species: str | None = None,
        family: str | None = None,
        issues: list[str] | None = None,
    ) -> dict:
        """
        Retrieve curated knowledge context for a plant.

        Args:
            species: Common or scientific name of the plant.
            family: Plant family (e.g., "Araceae", "Rosaceae").
            issues: List of detected issues/symptoms.

        Returns:
            Dict with care baselines, common issues, and any
            matching treatment protocols. This dict is injected
            into the LLM prompt as reference data.
        """
        result = {
            "care_baseline": None,
            "common_issues": [],
            "treatment_protocols": [],
            "source": "embedded_knowledge_base",
        }

        # Try to find matching family knowledge
        family_key = self._resolve_family_key(species, family)
        if family_key and family_key in PLANT_KNOWLEDGE_BASE:
            family_data = PLANT_KNOWLEDGE_BASE[family_key]
            result["care_baseline"] = family_data.get("care_baseline")
            result["common_issues"] = family_data.get("common_issues", [])
            result["matched_family"] = family_data.get("family", family_key)

        # If issues are provided, look up treatment knowledge
        if issues:
            for issue in issues:
                issue_lower = issue.lower()
                for category, treatment_data in TREATMENT_KNOWLEDGE_BASE.items():
                    if category.replace("_", " ") in issue_lower or issue_lower in category:
                        result["treatment_protocols"].append({
                            "category": category,
                            **treatment_data,
                        })

        return result

    async def get_treatment_knowledge(
        self,
        problem_category: str,
        species: str | None = None,
    ) -> dict:
        """
        Retrieve treatment-specific knowledge for a given problem.

        Args:
            problem_category: Category from PROBLEM_CATEGORIES
                              (e.g., "fungal_disease", "pest_infestation").
            species: Optional species for context.

        Returns:
            Dict with treatment protocols, product categories,
            and precautions.
        """
        category_key = problem_category.lower().strip()

        if category_key in TREATMENT_KNOWLEDGE_BASE:
            return {
                "category": category_key,
                **TREATMENT_KNOWLEDGE_BASE[category_key],
                "source": "embedded_knowledge_base",
            }

        # Fallback — return generic advice
        return {
            "category": category_key,
            "general_approach": "Consult a local plant specialist for specific diagnosis.",
            "product_categories": [],
            "common_treatments": [
                "Isolate the affected plant",
                "Document symptoms with clear photos",
                "Maintain proper watering and light conditions",
            ],
            "precautions": [
                "Avoid applying unknown treatments without identification",
            ],
            "source": "fallback",
        }

    def _resolve_family_key(
        self, species: str | None, family: str | None
    ) -> str | None:
        """
        Resolve a PLANT_KNOWLEDGE_BASE key from species/family names.

        Tries exact family match first, then fuzzy species match
        against known members.
        """
        # Try direct family match
        if family:
            family_lower = family.lower().strip()
            if family_lower in PLANT_KNOWLEDGE_BASE:
                return family_lower

        # Try matching species name against known members
        if species:
            species_lower = species.lower().strip()
            for key, data in PLANT_KNOWLEDGE_BASE.items():
                members = [m.lower() for m in data.get("common_members", [])]
                if any(species_lower in m or m in species_lower for m in members):
                    return key

        return None


class PlantKnowledgeRetriever:
    """
    RAG-ready Knowledge Retriever for plant care baselines, disease protocols,
    nutrient deficiencies, pest management, and treatment recommendations.
    Provides structured grounding to prevent LLM hallucinations.
    """

    def __init__(self, service: Optional[KnowledgeService] = None):
        self.service = service or KnowledgeService()

    async def get_relevant_knowledge(
        self,
        species: Optional[str] = None,
        family: Optional[str] = None,
        health_status: Optional[str] = None,
        issue: Optional[str] = None,
        symptoms: Optional[list[str]] = None,
    ) -> dict:
        """
        Retrieve structured reference knowledge for a plant's specific condition.

        Returns:
            Dict containing:
                - care_baseline: watering, sunlight, soil, fertilization, humidity, temperature
                - known_issues: known problems and symptoms for this plant family
                - treatment_context: treatment protocols and product categories if diseased
                - matched_family: resolved plant family name
        """
        issues_list = []
        if issue and issue.lower() not in ("no issues detected", "none", "healthy"):
            issues_list.append(issue)
        if symptoms:
            issues_list.extend(symptoms)

        plant_knowledge = await self.service.get_plant_knowledge(
            species=species,
            family=family,
            issues=issues_list if issues_list else None,
        )

        treatment_context = None
        if health_status in ("warning", "diseased") and issue:
            # Map issue name to probable category
            issue_lower = issue.lower()
            if "fung" in issue_lower or "spot" in issue_lower or "mildew" in issue_lower or "rust" in issue_lower or "blight" in issue_lower:
                category = "fungal_disease"
            elif "pest" in issue_lower or "mite" in issue_lower or "aphid" in issue_lower or "scale" in issue_lower or "bug" in issue_lower:
                category = "pest_infestation"
            elif "rot" in issue_lower or "overwater" in issue_lower:
                category = "root_rot"
            elif "deficien" in issue_lower or "chloros" in issue_lower or "yellow" in issue_lower:
                category = "nutrient_deficiency"
            elif "bacteri" in issue_lower:
                category = "bacterial_disease"
            else:
                category = "environmental_stress"

            treatment_context = await self.service.get_treatment_knowledge(
                problem_category=category,
                species=species,
            )

        return {
            "care_baseline": plant_knowledge.get("care_baseline"),
            "known_issues": plant_knowledge.get("common_issues", []),
            "treatment_context": treatment_context,
            "matched_family": plant_knowledge.get("matched_family"),
        }



