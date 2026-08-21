"""Pydantic request/response schemas for the API."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- Services
class ServiceBase(BaseModel):
    name: str
    duration_min: int = 30
    price: float | None = None
    description: str | None = None


class ServiceCreate(ServiceBase):
    pass


class ServiceOut(ORMModel, ServiceBase):
    id: str


# ---------------------------------------------------------------- Business
class BusinessBase(BaseModel):
    name: str
    industry: str | None = None
    timezone: str = "America/New_York"
    language: str = "en-US"
    greeting: str = "Thanks for calling. How can I help you today?"
    # Persona/instructions that drive a general voice agent (empty for the
    # legacy receptionist, which uses the structured booking brain).
    system_prompt: str | None = None
    agent_type: str = "assistant"
    owner_phone: str | None = None
    owner_email: str | None = None
    hours: dict = Field(default_factory=dict)
    booking_buffer_min: int = 0
    max_bookings_per_day: int = 20
    google_calendar_id: str | None = None
    voice_id: str = "default"
    escalation_threshold: float = 0.45


class BusinessCreate(BusinessBase):
    services: list[ServiceCreate] = Field(default_factory=list)
    # The setup wizard posts a finished profile, so this defaults to True.
    onboarding_complete: bool = True
    # Optional at setup — the virtual number (Twilio/Exotel/…) that routes calls
    # here. Usually provisioned later, so it's also editable in Settings.
    phone_number: str | None = None


class BusinessUpdate(BaseModel):
    name: str | None = None
    industry: str | None = None
    timezone: str | None = None
    language: str | None = None
    greeting: str | None = None
    owner_phone: str | None = None
    owner_email: str | None = None
    hours: dict | None = None
    booking_buffer_min: int | None = None
    max_bookings_per_day: int | None = None
    google_calendar_id: str | None = None
    voice_id: str | None = None
    escalation_threshold: float | None = None
    onboarding_complete: bool | None = None
    agent_live: bool | None = None
    system_prompt: str | None = None
    agent_type: str | None = None
    # The virtual number (Twilio/Exotel/…) that routes inbound calls to this
    # business. Match your provider's exact format (E.164, e.g. +15558124400) so
    # call routing can map the dialed number back to the right tenant.
    phone_number: str | None = None


class BusinessOut(ORMModel, BusinessBase):
    id: str
    phone_number: str | None = None
    onboarding_complete: bool
    agent_live: bool
    is_demo: bool = False
    services: list[ServiceOut] = Field(default_factory=list)
    created_at: datetime


class AgentSummary(ORMModel):
    """Lightweight row for the multi-agent list view."""

    id: str
    name: str
    industry: str | None = None
    language: str = "en-US"
    agent_type: str = "assistant"
    agent_live: bool
    is_demo: bool = False
    phone_number: str | None = None
    created_at: datetime


class PublicAgentOut(ORMModel):
    """Safe, unauthenticated view of a business for the embeddable voice agent.

    Deliberately excludes owner contacts, phone number, booking rules — only
    what the public conversation widget needs to greet and speak.
    """

    id: str
    name: str
    industry: str | None = None
    greeting: str
    language: str = "en-US"
    voice_id: str = "default"
    # Template label only (tutor/coding/receptionist/…) so the public page can
    # word itself appropriately. Carries no configuration or private data.
    agent_type: str = "assistant"


# ---------------------------------------------------------------- FAQ
class FaqBase(BaseModel):
    question: str
    answer: str


class FaqCreate(FaqBase):
    pass


class FaqUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None


class FaqOut(ORMModel, FaqBase):
    id: str
    source: str
    created_at: datetime


# ---------------------------------------------------------------- Transcript / Call
class TranscriptTurnOut(ORMModel):
    id: str
    seq: int
    role: str
    text: str
    start_ms: int
    confidence: float | None = None
    intent: str | None = None


class MessageOut(ORMModel):
    id: str
    caller_name: str | None = None
    caller_number: str | None = None
    body: str
    delivered: bool
    created_at: datetime


class CallSummary(ORMModel):
    id: str
    caller_number: str | None = None
    source: str
    status: str
    outcome: str | None = None
    summary: str | None = None
    sentiment: str | None = None
    duration_sec: int
    started_at: datetime | None = None
    created_at: datetime


class CallDetail(CallSummary):
    turns: list[TranscriptTurnOut] = Field(default_factory=list)
    messages: list[MessageOut] = Field(default_factory=list)
    recording_url: str | None = None


# ---------------------------------------------------------------- Booking
class BookingBase(BaseModel):
    customer_name: str | None = None
    customer_phone: str | None = None
    service_name: str = "Appointment"
    start_at: datetime
    duration_min: int = 30
    notes: str | None = None


class BookingCreate(BookingBase):
    pass


class BookingOut(ORMModel, BookingBase):
    id: str
    status: str
    call_id: str | None = None
    created_at: datetime


# ---------------------------------------------------------------- Dashboard / analytics
class DashboardStats(BaseModel):
    calls_today: int
    calls_week: int
    bookings_today: int
    bookings_week: int
    messages_pending: int
    escalations_week: int
    resolution_rate: float          # 0..1 share of calls resolved without escalation
    avg_duration_sec: float
    agent_live: bool


class TimePoint(BaseModel):
    label: str
    value: int


class OutcomeSlice(BaseModel):
    outcome: str
    count: int


class Analytics(BaseModel):
    volume_by_day: list[TimePoint]
    calls_by_hour: list[TimePoint]
    outcomes: list[OutcomeSlice]
    resolution_rate: float
    total_calls: int
    total_bookings: int


# ---------------------------------------------------------------- Providers / health
class ProviderStatus(BaseModel):
    kind: str            # stt | tts | llm | embedding
    provider: str        # selected provider name
    mode: str            # "open-source" | "paid" | "mock"
    available: bool      # deps installed / key present
    detail: str = ""


class UsageOut(BaseModel):
    """How much of today's public AI allowance is gone (see api/ratelimit.py)."""

    turns_used: int
    turns_limit: int
    media_used: int
    media_limit: int


class HealthOut(BaseModel):
    status: str
    version: str
    environment: str
    providers: list[ProviderStatus]
    # Whether the owner dashboard is password-protected. False on a public URL
    # means anyone who finds it can edit and delete every agent.
    dashboard_protected: bool = False
    usage: UsageOut | None = None


# ---------------------------------------------------------------- Simulator
class SimulateTurnIn(BaseModel):
    business_id: str
    call_id: str | None = None
    text: str


class SimulateTurnOut(BaseModel):
    call_id: str
    reply: str
    intent: str
    confidence: float
    outcome: str | None = None
    audio_url: str | None = None
    escalated: bool = False
