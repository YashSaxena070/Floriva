"""
AI Chat Router: conversational endpoint for Plantify AI assistant.

Provides a natural language interface for users to ask questions about
their plants using the Plantify AI Chat Agent LangGraph.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.common import SuccessResponse
from app.ai.graph.chat_graph import PlantifyChatRunner

router = APIRouter(prefix="/api/ai", tags=["AI Chat"])


# ── Request/Response Schemas ───────────────────────────────────────


class ChatRequest(BaseModel):
    """Request body for AI chat endpoint."""
    plant_id: str = Field(
        ..., description="UUID of the plant to ask about."
    )
    question: str = Field(
        ..., description="User's question about their plant.", min_length=1, max_length=2000
    )
    thread_id: Optional[str] = Field(
        default=None, description="Optional conversation thread ID for persistence."
    )


class ChatResponse(BaseModel):
    """Response from AI chat endpoint."""
    answer: str = Field(description="The AI's response to the user's question.")
    plant_id: str = Field(description="Plant ID that was queried.")
    thread_id: str = Field(description="Conversation thread ID used.")


# ── Endpoint ───────────────────────────────────────────────────────


@router.post("/chat", response_model=SuccessResponse, status_code=status.HTTP_200_OK)
async def ai_chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Conversational AI endpoint for plant care questions.

    The AI has access to the plant's complete history including:
    - Plant identity (name, scientific name, confidence)
    - Scan history (all past scans with identification & health analysis)
    - Health history (disease progression, severity trends)
    - Treatment history (care recommendations, products applied)
    - Recommended & purchased products (from cart)
    - Plant images
    - Curated knowledge base (care baselines, treatment protocols)

    Example questions:
    - "How is my Monstera doing?"
    - "Why are the leaves turning yellow?"
    - "What fertilizer should I use?"
    - "Is the neem oil I bought last month working?"
    - "When did I last water it?"
    - "What was the diagnosis on my last scan?"

    The conversation is persisted per thread_id (defaults to user_id).
    """
    try:
        # Validate plant_id format
        try:
            plant_uuid = uuid.UUID(request.plant_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid plant ID format. Must be a valid UUID.",
            )

        # Verify plant belongs to user
        from app.models.plant import Plant
        plant = db.query(Plant).filter(
            Plant.id == plant_uuid,
            Plant.user_id == current_user.id,
        ).first()

        if not plant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plant not found or access denied.",
            )

        # Run the chat agent
        runner = PlantifyChatRunner(db=db)
        result_state = await runner.run(
            user_id=str(current_user.id),
            plant_id=request.plant_id,
            question=request.question,
            thread_id=request.thread_id or f"chat_{current_user.id}_{request.plant_id}",
        )

        # Extract the AI's response from messages
        messages = result_state.get("messages", [])
        ai_response = ""

        # Find the last AI message
        for msg in reversed(messages):
            if hasattr(msg, 'type') and msg.type == 'ai':
                ai_response = msg.content
                break
            elif isinstance(msg, dict) and msg.get('type') == 'ai':
                ai_response = msg.get('content', '')
                break

        if not ai_response:
            ai_response = "I couldn't generate a response. Please try rephrasing your question."

        response_data = ChatResponse(
            answer=ai_response,
            plant_id=request.plant_id,
            thread_id=request.thread_id or f"chat_{current_user.id}_{request.plant_id}",
        )

        return SuccessResponse(data=response_data.model_dump(mode="json"))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI chat failed: {str(e)}",
        )