"""Dashboard: call list, call detail, messages, stats, and analytics."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import current_business_id
from app.db import get_db
from app.models.booking import Booking
from app.models.business import Business
from app.models.call import Call, Message
from app.schemas import (
    Analytics,
    CallDetail,
    CallSummary,
    DashboardStats,
    MessageOut,
    OutcomeSlice,
    TimePoint,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _day_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


@router.get("/stats", response_model=DashboardStats)
async def stats(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> DashboardStats:
    now = datetime.now(timezone.utc)
    today_start, today_end = _day_bounds(now)
    week_start = now - timedelta(days=7)

    async def count(model, *conds) -> int:
        stmt = select(func.count()).select_from(model).where(
            model.business_id == business_id, *conds
        )
        return int((await db.execute(stmt)).scalar() or 0)

    calls_today = await count(Call, Call.created_at >= today_start)
    calls_week = await count(Call, Call.created_at >= week_start)
    bookings_today = await count(
        Booking, Booking.start_at >= today_start, Booking.start_at < today_end
    )
    bookings_week = await count(Booking, Booking.created_at >= week_start)
    escalations_week = await count(
        Call, Call.created_at >= week_start, Call.status == "escalated"
    )

    # Pending messages (undelivered) across this business's calls.
    msg_stmt = (
        select(func.count())
        .select_from(Message)
        .join(Call, Message.call_id == Call.id)
        .where(Call.business_id == business_id, Message.delivered.is_(False))
    )
    messages_pending = int((await db.execute(msg_stmt)).scalar() or 0)

    resolution_rate = (
        1 - (escalations_week / calls_week) if calls_week else 1.0
    )

    dur_stmt = select(func.avg(Call.duration_sec)).where(
        Call.business_id == business_id, Call.created_at >= week_start
    )
    avg_duration = float((await db.execute(dur_stmt)).scalar() or 0)

    biz = await db.get(Business, business_id)

    return DashboardStats(
        calls_today=calls_today,
        calls_week=calls_week,
        bookings_today=bookings_today,
        bookings_week=bookings_week,
        messages_pending=messages_pending,
        escalations_week=escalations_week,
        resolution_rate=round(resolution_rate, 3),
        avg_duration_sec=round(avg_duration, 1),
        agent_live=bool(biz and biz.agent_live),
    )


@router.get("/calls", response_model=list[CallSummary])
async def list_calls(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
    limit: int = Query(default=50, le=200),
) -> list[Call]:
    result = await db.execute(
        select(Call)
        .where(Call.business_id == business_id)
        .order_by(Call.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars())


@router.get("/calls/{call_id}", response_model=CallDetail)
async def call_detail(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Call:
    result = await db.execute(
        select(Call)
        .where(Call.id == call_id, Call.business_id == business_id)
        .options(selectinload(Call.turns), selectinload(Call.messages))
    )
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(404, "Call not found")
    return call


@router.get("/messages", response_model=list[MessageOut])
async def list_messages(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> list[Message]:
    result = await db.execute(
        select(Message)
        .join(Call, Message.call_id == Call.id)
        .where(Call.business_id == business_id)
        .order_by(Message.created_at.desc())
    )
    return list(result.scalars())


@router.get("/analytics", response_model=Analytics)
async def analytics(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
    days: int = Query(default=14, le=90),
) -> Analytics:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    result = await db.execute(
        select(Call).where(
            Call.business_id == business_id, Call.created_at >= since
        )
    )
    calls = list(result.scalars())

    # Volume by day.
    per_day: Counter[str] = Counter()
    for c in calls:
        per_day[c.created_at.strftime("%Y-%m-%d")] += 1
    volume = [
        TimePoint(
            label=(since + timedelta(days=i)).strftime("%b %d"),
            value=per_day.get((since + timedelta(days=i)).strftime("%Y-%m-%d"), 0),
        )
        for i in range(days + 1)
    ]

    # Calls by hour of day.
    per_hour: Counter[int] = Counter()
    for c in calls:
        per_hour[c.created_at.hour] += 1
    by_hour = [
        TimePoint(label=f"{h:02d}:00", value=per_hour.get(h, 0)) for h in range(24)
    ]

    # Outcomes.
    outcome_counts: Counter[str] = Counter(c.outcome or "in_progress" for c in calls)
    outcomes = [
        OutcomeSlice(outcome=k, count=v) for k, v in outcome_counts.most_common()
    ]

    total_calls = len(calls)
    escalated = sum(1 for c in calls if c.status == "escalated")
    resolution_rate = 1 - (escalated / total_calls) if total_calls else 1.0

    booking_stmt = (
        select(func.count())
        .select_from(Booking)
        .where(Booking.business_id == business_id, Booking.created_at >= since)
    )
    total_bookings = int((await db.execute(booking_stmt)).scalar() or 0)

    return Analytics(
        volume_by_day=volume,
        calls_by_hour=by_hour,
        outcomes=outcomes,
        resolution_rate=round(resolution_rate, 3),
        total_calls=total_calls,
        total_bookings=total_bookings,
    )
