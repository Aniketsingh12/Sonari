"""FAQ node: retrieve relevant knowledge, then compose a grounded answer."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.i18n import t
from app.agent.prompts import receptionist_system
from app.agent.state import CallState
from app.providers import get_llm
from app.rag.retrieve import search_faqs

# Below this retrieval score we treat the knowledge base as "no good match".
_MIN_SCORE = 0.25


async def faq_answer_node(state: CallState, db: AsyncSession) -> CallState:
    lang = state.business.get("language")
    hits = await search_faqs(db, state.business_id, state.utterance, top_k=3)
    good = [h for h in hits if h.score >= _MIN_SCORE]

    if good:
        context = "\n\n".join(
            f"Q: {h.faq.question}\nA: {h.faq.answer}" for h in good
        )
        system = (
            receptionist_system(state.business)
            + "\n\nUse ONLY the following knowledge to answer. If it does not "
            "cover the question, say you'll take a message.\n\n"
            f"KNOWLEDGE:\n{context}"
        )
        llm = get_llm()
        reply = await llm.complete(
            system,
            [*state.as_messages(), {"role": "user", "content": state.utterance}],
            temperature=0.2,
            max_tokens=250,
        )
        # The mock LLM can't read arbitrary knowledge, so fall back to the best
        # answer verbatim when it returns its generic placeholder. (The stored
        # answer is already in the business's own language.)
        if llm.name == "mock" or not reply.strip():
            reply = good[0].faq.answer
        state.reply = reply.strip()
        state.outcome = "answered"
    else:
        state.reply = t(lang, "faq_no_match")
        state.intent = "take_message"  # hand off to message flow next turn
        state.outcome = "answered"
    return state
