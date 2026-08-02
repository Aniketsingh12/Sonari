"""Call, its transcript turns, and any message taken during it."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import IDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.business import Business


class Call(IDMixin, TimestampMixin, Base):
    __tablename__ = "calls"

    business_id: Mapped[str] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )

    # Telephony / source metadata.
    caller_number: Mapped[str | None] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(20), default="twilio")  # twilio | simulator
    twilio_sid: Mapped[str | None] = mapped_column(String(64), index=True)

    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    # in_progress | completed | escalated | missed | failed

    # Outcome summary computed post-call.
    outcome: Mapped[str | None] = mapped_column(String(30))
    # booked | answered | message | escalated | no_resolution
    summary: Mapped[str | None] = mapped_column(Text)
    sentiment: Mapped[str | None] = mapped_column(String(20))  # positive|neutral|negative

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_sec: Mapped[int] = mapped_column(Integer, default=0)

    recording_url: Mapped[str | None] = mapped_column(String(500))

    business: Mapped["Business"] = relationship(back_populates="calls")
    turns: Mapped[list["TranscriptTurn"]] = relationship(
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="TranscriptTurn.seq",
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="call", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship(back_populates="call")


class TranscriptTurn(IDMixin, Base):
    """One utterance in a call — from the caller or the agent."""

    __tablename__ = "transcript_turns"

    call_id: Mapped[str] = mapped_column(
        ForeignKey("calls.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(10))  # caller | agent
    text: Mapped[str] = mapped_column(Text, default="")

    # Playback sync: seconds from call start when this turn begins.
    start_ms: Mapped[int] = mapped_column(Integer, default=0)
    # Confidence of the agent's intent read for this turn (agent turns only).
    confidence: Mapped[float | None] = mapped_column(Float)
    intent: Mapped[str | None] = mapped_column(String(40))

    call: Mapped["Call"] = relationship(back_populates="turns")


class Message(IDMixin, TimestampMixin, Base):
    """A message the agent took to pass along to the owner."""

    __tablename__ = "messages"

    call_id: Mapped[str] = mapped_column(
        ForeignKey("calls.id", ondelete="CASCADE"), index=True
    )
    caller_name: Mapped[str | None] = mapped_column(String(200))
    caller_number: Mapped[str | None] = mapped_column(String(32))
    body: Mapped[str] = mapped_column(Text, default="")
    delivered: Mapped[bool] = mapped_column(default=False)

    call: Mapped["Call"] = relationship(back_populates="messages")
