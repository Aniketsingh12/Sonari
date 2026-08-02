"""Appointment booked by the agent."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import IDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.call import Call


class Booking(IDMixin, TimestampMixin, Base):
    __tablename__ = "bookings"

    business_id: Mapped[str] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    call_id: Mapped[str | None] = mapped_column(
        ForeignKey("calls.id", ondelete="SET NULL"), index=True
    )

    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(32))
    service_name: Mapped[str] = mapped_column(String(200), default="Appointment")

    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=30)

    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    # confirmed | pending | cancelled
    notes: Mapped[str | None] = mapped_column(Text)
    google_event_id: Mapped[str | None] = mapped_column(String(200))

    business: Mapped["Business"] = relationship(back_populates="bookings")
    call: Mapped["Call | None"] = relationship(back_populates="bookings")
