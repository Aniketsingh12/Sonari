"""Escalate node: hand the caller to a human.

MVP behaviour (per spec): read out the owner's number rather than doing a live
transfer. A real Twilio transfer would issue a ``<Dial>`` verb here.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.i18n import t
from app.agent.state import CallState


async def escalate_node(state: CallState, db: AsyncSession) -> CallState:
    lang = state.business.get("language")
    owner_phone = state.business.get("owner_phone")
    if owner_phone:
        state.reply = t(lang, "escalate_phone", phone=owner_phone)
    else:
        state.reply = t(lang, "escalate_no_phone")
    state.escalated = True
    state.outcome = "escalated"
    return state
