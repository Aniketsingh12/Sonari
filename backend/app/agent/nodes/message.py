"""Take-a-message node: capture a message for the owner."""
from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.i18n import t
from app.agent.state import CallState


def _extract_name(text: str) -> str | None:
    m = re.search(r"(?:my name is|this is|it's|i am|i'm)\s+([A-Za-z]+)", text, re.I)
    return m.group(1).title() if m else None


def _extract_phone(text: str) -> str | None:
    m = re.search(r"(\+?\d[\d\-\s().]{6,}\d)", text)
    return m.group(1).strip() if m else None


async def message_node(state: CallState, db: AsyncSession) -> CallState:
    lang = state.business.get("language")
    name = _extract_name(state.utterance) or state.slots.get("name")
    phone = _extract_phone(state.utterance) or state.caller_number

    # If we still have no callback number, ask for one before saving.
    if not phone and not state.slots.get("asked_number"):
        state.slots["asked_number"] = True
        state.reply = t(lang, "msg_ask_number")
        state.outcome = None
        return state

    state.message = {
        "caller_name": name,
        "caller_number": phone,
        "body": state.utterance,
    }
    state.reply = t(lang, "msg_taken")
    state.outcome = "message"
    return state
