"""The call-flow graph.

This is a small, dependency-free state machine shaped like a LangGraph graph:
an ``understand`` node classifies intent, a conditional edge routes to one of
four action nodes, and the resulting ``CallState`` carries the reply plus any
side-effect payloads (booking/message) back to the API layer.

To use real LangGraph instead, wrap these same node functions in a
``StateGraph`` and keep ``run_turn`` as the entry point — the node contracts
are unchanged.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.nodes import (
    booking_node,
    escalate_node,
    faq_answer_node,
    message_node,
    understand_node,
)
from app.agent.i18n import closing_phrases, t
from app.agent.state import CallState
from app.config import settings

_ACTION_NODES = {
    "book_appointment": booking_node,
    "faq": faq_answer_node,
    "take_message": message_node,
    "escalate": escalate_node,
}

def _is_closing(utterance: str, language: str | None) -> bool:
    # Short closing/acknowledgement remarks that should end the call politely
    # rather than being routed into the FAQ or message flow. Phrases are matched
    # in the business language (plus English, since callers code-switch).
    text = utterance.lower().strip(" .!?।")
    if not text:
        return False
    if text in {"no", "nope", "nah"}:
        return True
    phrases = closing_phrases(language)
    return any(p in text for p in phrases) and len(text.split()) <= 6


def _route(state: CallState) -> str:
    """Conditional edge: pick the next node from intent + confidence."""
    # Low confidence anywhere → escalate to a human (spec: escalate on low conf).
    if state.confidence < settings.escalation_confidence_threshold:
        return "escalate"
    return state.intent if state.intent in _ACTION_NODES else "faq"


async def run_turn(state: CallState, db: AsyncSession) -> CallState:
    """Run one caller-utterance → agent-reply cycle and update history."""
    state.reply = ""
    state.outcome = None
    state.booking = None
    state.message = None
    state.escalated = False

    # 0. Graceful close — don't route "no, that's all" into a message/FAQ.
    if _is_closing(state.utterance, state.business.get("language")):
        state.intent = "closing"
        state.confidence = 0.9
        state.reply = t(state.business.get("language"), "closing")
        state.outcome = "answered"
        state.history.append({"role": "caller", "content": state.utterance})
        state.history.append({"role": "agent", "content": state.reply})
        return state

    # 1. Understand.
    state = await understand_node(state, db)

    # 2. Route.
    next_node = _route(state)

    # 3. Act.
    node = _ACTION_NODES[next_node]
    state = await node(state, db)

    # 4. Record the exchange in history.
    state.history.append({"role": "caller", "content": state.utterance})
    state.history.append({"role": "agent", "content": state.reply})
    return state
