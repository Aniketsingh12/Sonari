"""The general, instruction-driven agent brain.

Unlike the receptionist graph (classify → book / faq / message / escalate), this
runs *any* agent from its own persona/instructions: a tutor tutors, a coding
helper explains code, a support agent supports. The agent's ``system_prompt``
is the behaviour; optional knowledge (the same FAQ/RAG store) is injected as
reference material; the LLM produces a spoken-style reply.

Used whenever an agent has a ``system_prompt`` set (see call_service.handle_turn).
"""
from __future__ import annotations

from app.agent.state import CallState
from app.providers import get_llm
from app.rag.retrieve import search_faqs
from sqlalchemy.ext.asyncio import AsyncSession

# Below this retrieval score, a knowledge hit is too weak to be worth injecting.
_KNOWLEDGE_MIN_SCORE = 0.15


def build_system_prompt(
    name: str, instructions: str, knowledge: str, language: str | None
) -> str:
    parts = [f"You are {name}, a helpful AI voice agent."]
    if instructions.strip():
        parts.append(instructions.strip())
    if knowledge.strip():
        parts.append(
            "Reference information you can draw on when relevant "
            "(don't mention it unless useful):\n" + knowledge.strip()
        )
    # This is spoken aloud via TTS, so keep it speakable.
    parts.append(
        "You are speaking out loud in a live voice conversation. Keep replies "
        "concise and natural — usually one to three sentences. Do not use "
        "markdown, bullet points, code blocks, headings, or emoji; speak in plain "
        "spoken sentences. If the user asks for something long, give the short "
        "spoken version and offer to go deeper."
    )
    if language and not language.lower().startswith("en"):
        parts.append(f"Always reply in the user's language ({language}).")
    return "\n\n".join(parts)


async def _knowledge_for(db: AsyncSession, business_id: str, query: str) -> str:
    """Retrieve the agent's most relevant knowledge entries for this turn."""
    try:
        hits = await search_faqs(db, business_id, query, top_k=3)
    except Exception:
        return ""
    good = [h for h in hits if h.score >= _KNOWLEDGE_MIN_SCORE]
    return "\n".join(f"- {h.faq.question}: {h.faq.answer}" for h in good)


async def run_general_turn(state: CallState, db: AsyncSession) -> CallState:
    agent = state.business
    name = agent.get("name") or "Assistant"
    instructions = agent.get("system_prompt") or ""

    knowledge = await _knowledge_for(db, state.business_id, state.utterance)
    system = build_system_prompt(name, instructions, knowledge, agent.get("language"))

    messages = state.as_messages() + [{"role": "user", "content": state.utterance}]
    reply = await get_llm().complete(
        system, messages, temperature=0.6, max_tokens=400
    )

    state.reply = (reply or "").strip() or (
        "Sorry, I didn't quite catch that — could you say it again?"
    )
    state.intent = "chat"
    state.confidence = 1.0
    state.outcome = "answered"
    # A general agent has no booking/message side-effects or escalation.
    state.booking = None
    state.message = None
    state.escalated = False
    return state
