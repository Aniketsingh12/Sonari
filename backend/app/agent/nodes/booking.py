"""Booking node: extract slots, check availability, create an appointment."""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.i18n import format_datetime, t
from app.agent.prompts import extract_booking_system
from app.agent.state import CallState
from app.models.booking import Booking
from app.providers import get_llm

_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _resolve_datetime(day: str | None, time_str: str | None) -> datetime | None:
    """Best-effort turn 'friday' + '3pm' into a concrete future datetime (UTC)."""
    if not day and not time_str:
        return None
    now = datetime.now(timezone.utc)
    base = now.date()

    if day:
        day = day.lower()
        if day == "today":
            pass
        elif day == "tomorrow":
            base = base + timedelta(days=1)
        elif day in _WEEKDAYS:
            delta = (_WEEKDAYS[day] - now.weekday()) % 7
            base = base + timedelta(days=delta or 7)

    hour, minute = 10, 0  # default mid-morning
    if time_str:
        m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", time_str.lower())
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2) or 0)
            ampm = m.group(3)
            if ampm == "pm" and hour < 12:
                hour += 12
            if ampm == "am" and hour == 12:
                hour = 0
    return datetime(base.year, base.month, base.day, hour, minute, tzinfo=timezone.utc)


async def _slots_used(db: AsyncSession, business_id: str, when: datetime) -> int:
    day_start = when.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    result = await db.execute(
        select(func.count())
        .select_from(Booking)
        .where(
            Booking.business_id == business_id,
            Booking.start_at >= day_start,
            Booking.start_at < day_end,
            Booking.status != "cancelled",
        )
    )
    return int(result.scalar() or 0)


async def booking_node(state: CallState, db: AsyncSession) -> CallState:
    llm = get_llm()
    raw = await llm.complete(
        extract_booking_system(),
        [{"role": "user", "content": state.utterance}],
        json_mode=True,
        temperature=0.0,
        max_tokens=120,
    )
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        parsed = {}

    # Merge newly extracted slots into any carried from earlier turns.
    for key in ("day", "time", "name"):
        if parsed.get(key):
            state.slots[key] = parsed[key]

    day = state.slots.get("day")
    time_str = state.slots.get("time")
    name = state.slots.get("name")

    lang = state.business.get("language")
    when = _resolve_datetime(day, time_str)

    if when is None:
        state.reply = t(lang, "booking_ask_time")
        state.outcome = None
        return state

    # Enforce the max-per-day booking rule.
    max_per_day = state.business.get("max_bookings_per_day", 20)
    if await _slots_used(db, state.business_id, when) >= max_per_day:
        state.reply = t(lang, "day_full")
        state.slots.pop("day", None)
        state.outcome = None
        return state

    services = state.business.get("services") or []
    service_name = services[0]["name"] if services else "Appointment"
    duration = services[0].get("duration_min", 30) if services else 30

    state.booking = {
        "customer_name": name,
        "customer_phone": state.caller_number,
        "service_name": service_name,
        "start_at": when.isoformat(),
        "duration_min": duration,
    }
    state.reply = t(
        lang,
        "booking_confirmed",
        name=f", {name}" if name else "",
        service=service_name.lower(),
        when=format_datetime(lang, when),
    )
    state.outcome = "booked"
    return state
