"""Business profile: the tenant that owns a phone agent."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import IDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.call import Call
    from app.models.faq import Faq


class Business(IDMixin, TimestampMixin, Base):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(100))
    timezone: Mapped[str] = mapped_column(String(64), default="America/New_York")
    # BCP-47 code the agent speaks to callers in (see agent/i18n.LANGUAGES).
    language: Mapped[str] = mapped_column(String(12), default="en-US")

    # Greeting the agent opens with; owner phone for escalation/summaries.
    greeting: Mapped[str] = mapped_column(
        Text, default="Thanks for calling. How can I help you today?"
    )
    # General voice-agent builder: free-form persona/instructions that drive the
    # agent. When set, the agent runs the instruction-driven brain instead of the
    # fixed receptionist graph. ``agent_type`` records the template it came from.
    system_prompt: Mapped[str | None] = mapped_column(Text)
    agent_type: Mapped[str] = mapped_column(String(40), default="assistant")
    owner_phone: Mapped[str | None] = mapped_column(String(32))
    owner_email: Mapped[str | None] = mapped_column(String(200))
    phone_number: Mapped[str | None] = mapped_column(String(32))

    # {"mon": ["09:00","17:00"], "sun": null, ...}
    hours: Mapped[dict] = mapped_column(JSON, default=dict)

    # Booking rules.
    booking_buffer_min: Mapped[int] = mapped_column(Integer, default=0)
    max_bookings_per_day: Mapped[int] = mapped_column(Integer, default=20)
    google_calendar_id: Mapped[str | None] = mapped_column(String(200))

    # Voice + escalation config.
    voice_id: Mapped[str] = mapped_column(String(100), default="default")
    escalation_threshold: Mapped[float] = mapped_column(Float, default=0.45)

    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    agent_live: Mapped[bool] = mapped_column(Boolean, default=True)
    # True for the loaded sample business, so the UI can offer a one-click exit.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    services: Mapped[list["Service"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    faqs: Mapped[list["Faq"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    calls: Mapped[list["Call"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class Service(IDMixin, TimestampMixin, Base):
    __tablename__ = "services"

    business_id: Mapped[str] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=30)
    price: Mapped[float | None] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(Text)

    business: Mapped["Business"] = relationship(back_populates="services")
