"""Orchestrates a call: builds agent state, runs a turn, persists side effects."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.agent import run_turn
from app.agent.general import run_general_turn
from app.agent.state import CallState
from app.models.booking import Booking
from app.models.business import Business
from app.models.call import Call, Message, TranscriptTurn


async def _load_business_dict(db: AsyncSession, business_id: str) -> dict:
    result = await db.execute(
        select(Business)
        .where(Business.id == business_id)
        .options(selectinload(Business.services))
    )
    biz = result.scalar_one()
    return {
        "id": biz.id,
        "name": biz.name,
        "greeting": biz.greeting,
        "language": biz.language,
        "system_prompt": biz.system_prompt,
        "owner_phone": biz.owner_phone,
        "max_bookings_per_day": biz.max_bookings_per_day,
        "escalation_threshold": biz.escalation_threshold,
        "services": [
            {"name": s.name, "duration_min": s.duration_min, "price": s.price}
            for s in biz.services
        ],
    }


async def get_or_create_call(
    db: AsyncSession,
    business_id: str,
    *,
    call_id: str | None = None,
    caller_number: str | None = None,
    source: str = "simulator",
    twilio_sid: str | None = None,
) -> Call:
    if call_id:
        result = await db.execute(
            select(Call)
            .where(Call.id == call_id)
            .options(selectinload(Call.turns))
        )
        call = result.scalar_one_or_none()
        if call:
            return call

    call = Call(
        business_id=business_id,
        caller_number=caller_number,
        source=source,
        twilio_sid=twilio_sid,
        status="in_progress",
        started_at=datetime.now(timezone.utc),
    )
    db.add(call)
    await db.flush()
    return call


async def _history_from_turns(db: AsyncSession, call_id: str) -> list[dict[str, str]]:
    result = await db.execute(
        select(TranscriptTurn)
        .where(TranscriptTurn.call_id == call_id)
        .order_by(TranscriptTurn.seq)
    )
    return [{"role": t.role, "content": t.text} for t in result.scalars()]


async def handle_turn(
    db: AsyncSession,
    business_id: str,
    utterance: str,
    *,
    call_id: str | None = None,
    caller_number: str | None = None,
    source: str = "simulator",
    twilio_sid: str | None = None,
) -> dict:
    """Process one caller utterance and return the agent's reply + metadata."""
    call = await get_or_create_call(
        db,
        business_id,
        call_id=call_id,
        caller_number=caller_number,
        source=source,
        twilio_sid=twilio_sid,
    )

    business = await _load_business_dict(db, business_id)
    history = await _history_from_turns(db, call.id)

    # Carry booking slots across turns via the last agent state is not stored;
    # for the demo we re-derive from the running utterance each turn.
    state = CallState(
        business_id=business_id,
        call_id=call.id,
        caller_number=call.caller_number,
        business=business,
        history=history,
        utterance=utterance,
    )

    # Instruction-driven agents (tutor, coding helper, …) run the general brain;
    # the legacy receptionist (no system_prompt) keeps the structured graph.
    if business.get("system_prompt"):
        state = await run_general_turn(state, db)
    else:
        state = await run_turn(state, db)

    # Persist the two new transcript turns.
    seq = len(history)
    started = call.started_at or datetime.now(timezone.utc)
    if started.tzinfo is None:  # SQLite returns naive datetimes; assume UTC.
        started = started.replace(tzinfo=timezone.utc)
    now_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    db.add(TranscriptTurn(
        call_id=call.id, seq=seq, role="caller", text=utterance, start_ms=max(0, now_ms)
    ))
    db.add(TranscriptTurn(
        call_id=call.id, seq=seq + 1, role="agent", text=state.reply,
        start_ms=max(0, now_ms + 500), confidence=state.confidence, intent=state.intent,
    ))

    # Persist side effects.
    if state.booking:
        db.add(Booking(
            business_id=business_id,
            call_id=call.id,
            customer_name=state.booking.get("customer_name"),
            customer_phone=state.booking.get("customer_phone"),
            service_name=state.booking.get("service_name", "Appointment"),
            start_at=datetime.fromisoformat(state.booking["start_at"]),
            duration_min=state.booking.get("duration_min", 30),
            status="confirmed",
        ))

    if state.message:
        db.add(Message(
            call_id=call.id,
            caller_name=state.message.get("caller_name"),
            caller_number=state.message.get("caller_number"),
            body=state.message.get("body", ""),
        ))

    if state.escalated:
        call.status = "escalated"

    await db.flush()

    return {
        "call_id": call.id,
        "reply": state.reply,
        "intent": state.intent,
        "confidence": state.confidence,
        "outcome": state.outcome,
        "escalated": state.escalated,
    }


async def finalize_call(db: AsyncSession, call_id: str) -> None:
    """Close a call and compute its outcome/summary (post-call job)."""
    from app.agent.prompts import summarize_call_system
    from app.providers import get_llm
    import json

    result = await db.execute(
        select(Call).where(Call.id == call_id).options(selectinload(Call.turns))
    )
    call = result.scalar_one_or_none()
    if not call or call.status == "completed":
        return

    call.ended_at = datetime.now(timezone.utc)
    if call.started_at:
        started = call.started_at
        if started.tzinfo is None:  # SQLite returns naive datetimes; assume UTC.
            started = started.replace(tzinfo=timezone.utc)
        call.duration_sec = max(
            0, int((call.ended_at - started).total_seconds())
        )

    messages = [
        {"role": "user" if t.role == "caller" else "assistant", "content": t.text}
        for t in call.turns
    ]
    if messages:
        llm = get_llm()
        raw = await llm.complete(
            summarize_call_system(), messages, json_mode=True, max_tokens=200
        )
        try:
            data = json.loads(raw)
            call.outcome = data.get("outcome")
            call.sentiment = data.get("sentiment")
            call.summary = data.get("summary")
        except (json.JSONDecodeError, TypeError):
            pass

    if call.status != "escalated":
        call.status = "completed"
    await db.flush()
