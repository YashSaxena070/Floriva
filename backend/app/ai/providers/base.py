"""
Abstract base classes for AI service providers.

These define the interfaces that future AI implementations must follow.
Different providers (PlantNet, custom models, LLMs) will implement
these interfaces, allowing them to be swapped without changing API routes.

Example future implementations:
    - PlantNetProvider(PlantIdentificationProvider)
    - CustomDiseaseModelProvider(DiseaseAnalysisProvider)
    - LLMProvider(AIRecommendationProvider)
"""

from abc import ABC, abstractmethod
from typing import Any, Optional


class PlantIdentificationProvider(ABC):
    """
    Interface for plant identification services.
    Implementations should accept an image and return identification results.
    """

    @abstractmethod
    async def identify(
        self,
        image_path: str,
        organs: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Identify a plant from an image.

        Args:
            image_path: Path to the plant image file.
            organs: Optional list of plant organs visible in the image
                    (e.g., ["leaf", "flower", "fruit"]).

        Returns:
            Dict with identification results including:
                - species: str (scientific name)
                - common_names: list[str]
                - confidence: float (0.0 to 1.0)
                - family: str
                - genus: str
        """
        ...

    @abstractmethod
    async def get_plant_details(self, species: str) -> dict[str, Any]:
        """
        Get detailed information about a specific plant species.

        Args:
            species: Scientific name of the plant.

        Returns:
            Dict with plant details (care info, description, etc.)
        """
        ...


class HealthAnalysisProvider(ABC):
    """
    Interface for plant health analysis services.
    Implementations should analyze a plant image for health indicators.
    """

    @abstractmethod
    async def analyze_health(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Analyze plant health from an image.

        Args:
            image_path: Path to the plant image file.
            plant_species: Optional known species for better analysis.

        Returns:
            Dict with health analysis including:
                - health_status: str (e.g., "Healthy", "Needs Attention")
                - health_score: float (0-100)
                - issues: list[dict] with issue details
                - recommendations: list[str]
        """
        ...


class DiseaseAnalysisProvider(ABC):
    """
    Interface for plant disease detection services.
    Implementations should detect and classify plant diseases.
    """

    @abstractmethod
    async def detect_diseases(
        self,
        image_path: str,
        plant_species: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Detect diseases in a plant image.

        Args:
            image_path: Path to the plant image file.
            plant_species: Optional known species for better detection.

        Returns:
            Dict with disease detection results including:
                - diseases: list[dict] with disease name, confidence, severity
                - treatment_suggestions: list[str]
                - prevention_tips: list[str]
        """
        ...


class AIRecommendationProvider(ABC):
    """
    Interface for AI-powered care recommendations.
    Implementations can use LLMs or rule-based systems.
    """

    @abstractmethod
    async def get_care_recommendations(
        self,
        plant_species: str,
        health_data: Optional[dict] = None,
        weather_data: Optional[dict] = None,
    ) -> dict[str, Any]:
        """
        Generate personalized care recommendations for a plant.

        Args:
            plant_species: Scientific or common name of the plant.
            health_data: Optional current health analysis data.
            weather_data: Optional current weather/environment data.

        Returns:
            Dict with care recommendations including:
                - watering: dict (schedule, amount)
                - sunlight: dict (requirements, tips)
                - fertilizer: dict (type, schedule)
                - general_tips: list[str]
        """
        ...


class ProductRecommendationProvider(ABC):
    """
    Interface for product recommendation services.
    Implementations suggest products based on plant health and needs.
    """

    @abstractmethod
    async def get_recommendations(
        self,
        plant_species: str,
        issues: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Get product recommendations for plant care.

        Args:
            plant_species: Scientific or common name of the plant.
            issues: Optional list of current plant issues.

        Returns:
            Dict with product recommendations including:
                - fertilizers: list[dict]
                - treatments: list[dict]
                - tools: list[dict]
        """
        ...
