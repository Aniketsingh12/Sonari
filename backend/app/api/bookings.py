"""Bookings: list and manage appointments the agent created."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_business_id
from app.db import get_db
from app.models.booking import Booking
from app.schemas import BookingCreate, BookingOut

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.get("", response_model=list[BookingOut])
async def list_bookings(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
) -> list[Booking]:
    stmt = select(Booking).where(Booking.business_id == business_id)
    if start:
        stmt = stmt.where(Booking.start_at >= start)
    if end:
        stmt = stmt.where(Booking.start_at < end)
    stmt = stmt.order_by(Booking.start_at)
    result = await db.execute(stmt)
    return list(result.scalars())


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(
    payload: BookingCreate,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Booking:
    booking = Booking(business_id=business_id, **payload.model_dump())
    db.add(booking)
    await db.flush()
    return booking


@router.patch("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(
    booking_id: str,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Booking:
    booking = await db.get(Booking, booking_id)
    if not booking or booking.business_id != business_id:
        raise HTTPException(404, "Booking not found")
    booking.status = "cancelled"
    await db.flush()
    return booking
