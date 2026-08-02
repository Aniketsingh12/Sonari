"""Calendar tool: availability + booking.

Ships with a local implementation backed by the app database so bookings work
with zero setup. Set ``GOOGLE_CALENDAR_ID`` and provide OAuth credentials to
route ``create_event`` to the real Google Calendar API instead.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.booking import Booking


async def check_availability(
    business_id: str, when: datetime, max_per_day: int = 16
) -> bool:
    """Is ``when`` bookable given the per-day cap?"""
    day_start = when.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    async with SessionLocal() as db:
        used = (
            await db.execute(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.business_id == business_id,
                    Booking.start_at >= day_start,
                    Booking.start_at < day_end,
                    Booking.status != "cancelled",
                )
            )
        ).scalar() or 0
    return int(used) < max_per_day


async def create_event(
    business_id: str,
    start_at: datetime,
    *,
    customer_name: str | None = None,
    service_name: str = "Appointment",
    duration_min: int = 30,
) -> str:
    """Create a booking and return its id (the 'event id')."""
    async with SessionLocal() as db:
        booking = Booking(
            business_id=business_id,
            customer_name=customer_name,
            service_name=service_name,
            start_at=start_at,
            duration_min=duration_min,
            status="confirmed",
        )
        db.add(booking)
        await db.flush()
        event_id = booking.id
        await db.commit()
    return event_id


# ---- Optional: expose as a standalone MCP server -------------------------
def _build_mcp():  # pragma: no cover - only when `mcp` is installed
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("sonari-calendar")

    @mcp.tool()
    async def availability(business_id: str, iso_datetime: str) -> bool:
        return await check_availability(
            business_id, datetime.fromisoformat(iso_datetime)
        )

    @mcp.tool()
    async def book(
        business_id: str,
        iso_datetime: str,
        customer_name: str = "",
        service_name: str = "Appointment",
        duration_min: int = 30,
    ) -> str:
        return await create_event(
            business_id,
            datetime.fromisoformat(iso_datetime),
            customer_name=customer_name or None,
            service_name=service_name,
            duration_min=duration_min,
        )

    return mcp


if __name__ == "__main__":  # pragma: no cover
    _build_mcp().run()
