"""
LangChain configuration and model factory for Plantify.

Configures ChatGroq instances for use with LangChain structured output,
runnables, tools, and LangGraph nodes.
"""

import logging
from typing import Optional
from langchain_groq import ChatGroq

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Active Groq LLM models
DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
FALLBACK_GROQ_MODEL = "openai/gpt-oss-20b"


def get_chat_model(
    model_name: str = DEFAULT_GROQ_MODEL,
    temperature: float = 0.2,
    max_tokens: Optional[int] = 4096,
) -> ChatGroq:
    """
    Instantiate and return a ChatGroq client configured with application settings.
    """
    settings = get_settings()
    api_key = settings.GROQ_API_KEY

    if not api_key:
        logger.warning("GROQ_API_KEY is not set in environment settings.")

    return ChatGroq(
        model_name=model_name,
        groq_api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def get_vision_chat_model(
    model_name: str = DEFAULT_GROQ_MODEL,
    temperature: float = 0.1,
) -> ChatGroq:
    """
    Instantiate a ChatGroq client for structuring and analysis.
    """
    settings = get_settings()
    return ChatGroq(
        model_name=model_name,
        groq_api_key=settings.GROQ_API_KEY,
        temperature=temperature,
    )
