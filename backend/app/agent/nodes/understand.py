"""Understand node: classify intent + confidence for routing."""
from __future__ import annotations

import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.prompts import classify_intent_system
from app.agent.state import CallState
from app.providers import get_llm

_VALID = {"book_appointment", "faq", "take_message", "escalate"}


async def understand_node(state: CallState, db: AsyncSession) -> CallState:
    llm = get_llm()
    # Only a little history: enough to resolve "it"/"that", not so much that the
    # model classifies what the call *was* about instead of the latest message.
    raw = await llm.complete(
        classify_intent_system(),
        [*state.as_messages(limit=2), {"role": "user", "content": state.utterance}],
        json_mode=True,
        temperature=0.0,
        max_tokens=120,
    )
    intent, confidence = "faq", 0.5
    try:
        data = json.loads(raw)
        intent = data.get("intent", "faq")
        confidence = float(data.get("confidence", 0.5))
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    if intent not in _VALID:
        intent = "faq"
    state.intent = intent
    state.confidence = max(0.0, min(1.0, confidence))
    return state
