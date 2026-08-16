"""
LangGraph Workflow Definition for Plantify AI Chat Agent.

A separate conversational agent that answers user questions about their plants
with full access to plant history (identity, scans, health, treatments, products).

Tools available:
- get_plant_history: Complete plant history
- get_latest_scan: Most recent scan details
- get_plant_identity: Plant name & scientific name
- search_plant_knowledge: Care baselines & treatment protocols

This graph runs independently from the main analysis pipeline.
"""

import logging
from typing import Annotated, Any, Optional, TypedDict
from operator import add

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from app.ai.tools.plant_tools import create_plant_tools
from app.ai.graph.langchain_config import get_chat_model
from app.config.database import SessionLocal

logger = logging.getLogger(__name__)


# ── Chat State ─────────────────────────────────────────────────────


class PlantifyChatState(TypedDict, total=False):
    """
    State for the conversational AI chat agent.
    """

    # ── Context ─────────────────────────────────────────────────
    user_id: str
    plant_id: str

    # ── Conversation ────────────────────────────────────────────
    messages: Annotated[list[BaseMessage], add]
    current_question: str

    # ── Tools & Execution ───────────────────────────────────────
    tool_calls: list[dict[str, Any]]

    # ── Trace ───────────────────────────────────────────────────
    trace_messages: Annotated[list[str], add]  # trace messages
    errors: Annotated[list[str], add]


def create_initial_chat_state(
    user_id: str = "",
    plant_id: str = "",
    question: str = "",
) -> PlantifyChatState:
    """Helper to initialize chat state."""
    return {
        "user_id": user_id,
        "plant_id": plant_id,
        "messages": [HumanMessage(content=question)] if question else [],
        "current_question": question,
        "tool_calls": [],
        "trace_messages": [],
        "errors": [],
    }


# ── System Prompt ──────────────────────────────────────────────────


CHAT_SYSTEM_PROMPT = """You are Plantify's AI Plant Care Assistant.

You help users understand and care for their plants by answering questions
using the plant's complete history and verified horticultural knowledge.

## Your Capabilities

You have access to these tools:
1. **get_plant_history** - Retrieves complete plant history (scans, health analyses, care plans, treatments, cart items, images)
2. **get_latest_scan** - Gets the most recent scan with full details
3. **get_plant_identity** - Gets the plant's name, scientific name, confidence
4. **search_plant_knowledge** - Searches curated knowledge base for care baselines & treatment protocols

## Critical Rules

### Database = Truth, LLM = Reasoning
- **NEVER invent or hallucinate plant history.** Always call get_plant_history or get_latest_scan first.
- **NEVER invent product information.** Use the database via tools.
- **NEVER guess treatment protocols.** Use search_plant_knowledge for validated care baselines.

### Response Style
- Be conversational, helpful, and empathetic.
- Cite specific data from the plant's history when answering.
- If the plant has no history yet, say so and offer general guidance.
- Explain medical/plant health terms in plain language.

### Tool Usage Strategy
1. **Always start with get_plant_history** when user asks about their specific plant
2. Use **get_latest_scan** for quick "what's wrong now" questions
3. Use **search_plant_knowledge** for general care questions or treatment details
4. Combine tool results with your reasoning to give comprehensive answers

## Example Interactions

**User:** "How is my Monstera doing?"
→ Call get_plant_history → Summarize health trajectory, latest status, treatments

**User:** "Why are the leaves turning yellow?"
→ Call get_plant_history + search_plant_knowledge(issue="yellow leaves") → Explain causes, reference history

**User:** "What fertilizer should I use?"
→ Call get_plant_history → check treatment_summary for past fertilizer use → search_plant_knowledge for care baseline → recommend

**User:** "Is the neem oil I bought last month working?"
→ Call get_plant_history → check cart_history for neem oil, health_summary for trend → analyze

## Response Format

Structure your responses:
1. **Direct answer** - Address the question immediately
2. **Evidence from history** - Cite specific scans, health checks, treatments
3. **Knowledge context** - Reference care baselines when relevant
4. **Actionable guidance** - Next steps or monitoring advice
"""


# ── Chat Node ──────────────────────────────────────────────────────


async def chat_agent_node(
    state: PlantifyChatState,
    config: Optional[RunnableConfig] = None,
) -> dict[str, Any]:
    """
    Main chat agent node that processes user questions using tools.
    """
    from langchain_core.messages import AIMessage, ToolMessage

    # Get DB session
    db = None
    close_db = False
    if config and "configurable" in config and "db" in config["configurable"]:
        db = config["configurable"]["db"]
    else:
        db = SessionLocal()
        close_db = True

    try:
        # Create tools with DB session
        tools = create_plant_tools(db)
        tool_node = ToolNode(tools)

        # Get LLM with tools bound
        llm = get_chat_model().bind_tools(tools)

        # Build messages: system + conversation history
        system_msg = SystemMessage(content=CHAT_SYSTEM_PROMPT)
        conversation = state.get("messages", [])
        all_messages = [system_msg] + conversation

        # Add plant context hint if available
        plant_id = state.get("plant_id")
        if plant_id:
            context_hint = (
                f"\n[Context: User is asking about plant_id={plant_id}. "
                "Use get_plant_history tool first to retrieve their plant's complete context.]"
            )
            # Append as a system reminder
            all_messages.append(SystemMessage(content=context_hint))

        # Invoke LLM with tools
        logger.info(
            "Node[chat_agent]: Processing question for plant_id=%s, user_id=%s",
            plant_id, state.get("user_id"),
        )
        response = await llm.ainvoke(all_messages, config=config)

        # Check if tool calls were made
        if response.tool_calls:
            # Execute tool calls
            tool_results = []
            for tool_call in response.tool_calls:
                try:
                    result = await tool_node.ainvoke(
                        {"messages": [AIMessage(content="", tool_calls=[tool_call])]},
                        config=config,
                    )
                    tool_results.extend(result.get("messages", []))
                    logger.info("Node[chat_agent]: Tool %s executed", tool_call["name"])
                except Exception as tool_err:
                    logger.error("Node[chat_agent]: Tool %s failed: %s", tool_call["name"], tool_err)
                    tool_results.append(
                        ToolMessage(
                            content=f"Tool error: {str(tool_err)}",
                            tool_call_id=tool_call["id"],
                        )
                    )

            # Now invoke LLM again with tool results
            all_messages.append(response)
            all_messages.extend(tool_results)
            final_response = await llm.ainvoke(all_messages, config=config)

            return {
                "messages": [final_response],
                "trace_messages": [f"Chat agent responded with tool usage."],
            }

        # No tool calls needed, return direct response
        return {
            "messages": [response],
            "trace_messages": ["Chat agent responded directly."],
        }

    except Exception as e:
        err = f"Chat agent error: {str(e)}"
        logger.exception("Node[chat_agent]: %s", err)
        return {
            "errors": [err],
            "messages": [AIMessage(content="I encountered an error processing your question. Please try again.")],
            "trace_messages": [f"Chat agent error: {err}"],
        }
    finally:
        if close_db and db:
            db.close()


# ── Graph Construction ─────────────────────────────────────────────


def create_chat_graph() -> StateGraph:
    """
    Builds the Plantify AI Chat Agent graph.

    Simple single-node graph with tool calling loop:
    START → chat_agent → (tools) → chat_agent → END
    """
    workflow = StateGraph(PlantifyChatState)

    # Add the chat agent node
    workflow.add_node("chat_agent", chat_agent_node)

    # Add tool node for execution
    # Tools are invoked via the chat_agent node's tool calling

    # Edges
    workflow.add_edge(START, "chat_agent")
    workflow.add_edge("chat_agent", END)

    return workflow


# ── Compiled Graph with Checkpointer ───────────────────────────────

memory_checkpointer = MemorySaver()

plantify_chat_graph = create_chat_graph().compile(
    checkpointer=memory_checkpointer,
)


# ── Runner ─────────────────────────────────────────────────────────


class PlantifyChatRunner:
    """
    Runner for the Plantify AI Chat Agent graph.
    """

    def __init__(self, db: Any = None):
        self.db = db
        self.graph = plantify_chat_graph

    async def run(
        self,
        user_id: str = "",
        plant_id: str = "",
        question: str = "",
        thread_id: str = None,
    ) -> PlantifyChatState:
        """
        Execute the chat agent for a user question.

        Args:
            user_id: User ID
            plant_id: Plant ID (optional - if not provided, general knowledge only)
            question: User's question
            thread_id: Conversation thread ID for checkpointing (defaults to user_id)

        Returns:
            Final state with AI response in messages
        """
        state = create_initial_chat_state(
            user_id=user_id,
            plant_id=plant_id,
            question=question,
        )

        # Use thread_id for conversation persistence
        tid = thread_id or f"chat_{user_id}"
        config = {
            "configurable": {
                "thread_id": tid,
            }
        }
        if self.db:
            config["configurable"]["db"] = self.db

        logger.info(
            "Running PlantifyChat for user_id=%s, plant_id=%s, thread_id=%s",
            user_id, plant_id, tid,
        )

        result_state = await self.graph.ainvoke(state, config=config)

        logger.info(
            "PlantifyChat finished for thread_id=%s. Messages: %d",
            tid, len(result_state.get("messages", [])),
        )

        return result_state


async def run_chat(
    user_id: str = "",
    plant_id: str = "",
    question: str = "",
    db: Any = None,
    thread_id: str = None,
) -> PlantifyChatState:
    """Convenience helper to run the chat agent."""
    runner = PlantifyChatRunner(db=db)
    return await runner.run(
        user_id=user_id,
        plant_id=plant_id,
        question=question,
        thread_id=thread_id,
    )