"""Optional sample data.

Sonari is vertical-agnostic: a fresh install starts empty and the owner
configures their own business through the setup wizard. This module only
provides *sample* data — a realistic dental clinic — loaded on demand from the
dashboard (``POST /api/demo/seed``) or at startup when ``SEED_DEMO_DATA=true``.
Nothing here is required by the product; it exists to make demos instant.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import SessionLocal
from app.models.booking import Booking
from app.models.business import Business, Service
from app.models.call import Call, Message, TranscriptTurn
from app.models.faq import Faq
from app.rag.ingest import reindex_business

DEMO_FAQS = [
    ("How much is a routine cleaning?",
     "A routine cleaning is $95, and it usually takes about 45 minutes."),
    ("What are your hours?",
     "We're open Monday to Friday, 9am to 5pm, and Saturdays 9am to 1pm. "
     "We're closed on Sundays."),
    ("Do you accept insurance?",
     "Yes, we accept most major dental insurance plans including Delta Dental, "
     "Cigna, and MetLife. Bring your card and we'll handle the rest."),
    ("Where are you located?",
     "We're at 214 Maple Street, Suite 3, right next to the Riverside pharmacy. "
     "There's free parking in the lot behind the building."),
    ("Do you offer teeth whitening?",
     "Yes — in-office whitening is $250 for a full session and takes about an "
     "hour. We also offer take-home trays for $150."),
    ("Do you see children?",
     "Absolutely, we're a family practice and welcome patients of all ages."),
]

DEMO_SERVICES = [
    ("Routine Cleaning", 45, 95.0),
    ("New Patient Exam", 60, 120.0),
    ("Teeth Whitening", 60, 250.0),
]


def _dt(days: int, hour: int, minute: int = 0) -> datetime:
    base = datetime.now(timezone.utc) + timedelta(days=days)
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


async def business_count(db: AsyncSession) -> int:
    return int((await db.execute(select(func.count()).select_from(Business))).scalar() or 0)


async def ensure_seed_data() -> None:
    """Startup hook. Only loads the sample business when explicitly enabled."""
    if not settings.seed_demo_data:
        return
    async with SessionLocal() as db:
        if await business_count(db):
            return
        await create_demo_business(db)
        await db.commit()


async def reset_all(db: AsyncSession) -> None:
    """Delete every business (cascades to calls, bookings, FAQs)."""
    await db.execute(delete(Business))
    await db.flush()


async def create_demo_business(db: AsyncSession) -> Business:
    """Create the sample business with FAQs, calls, and bookings."""
    biz = Business(
        name="Bright Smile Dental",
        # Sample data is an appointment business, so it's a receptionist: no
        # instructions, structured booking brain, bookings UI.
        agent_type="receptionist",
        industry="Dental clinic",
        timezone="America/New_York",
        greeting="Thanks for calling Bright Smile Dental! How can I help you today?",
        owner_phone="+1 (555) 812-4400",
        owner_email="frontdesk@brightsmile.example",
        phone_number="+15558124400",
        hours={
            "mon": ["09:00", "17:00"], "tue": ["09:00", "17:00"],
            "wed": ["09:00", "17:00"], "thu": ["09:00", "17:00"],
            "fri": ["09:00", "17:00"], "sat": ["09:00", "13:00"], "sun": None,
        },
        max_bookings_per_day=16,
        voice_id="default",
        onboarding_complete=True,
        agent_live=True,
        is_demo=True,
    )
    biz.services = [
        Service(name=n, duration_min=d, price=p) for n, d, p in DEMO_SERVICES
    ]
    biz.faqs = [Faq(question=q, answer=a) for q, a in DEMO_FAQS]
    db.add(biz)
    await db.flush()

    await reindex_business(db, biz.id)
    await _seed_calls_and_bookings(db, biz.id)
    return biz


async def _seed_calls_and_bookings(db, business_id: str) -> None:
    now = datetime.now(timezone.utc)

    # Call 1 — a booking.
    call1 = Call(
        business_id=business_id, caller_number="+1 (555) 240-1180", source="twilio",
        status="completed", outcome="booked", sentiment="positive",
        summary="Caller booked a routine cleaning for next week.",
        started_at=now - timedelta(hours=3), ended_at=now - timedelta(hours=3, minutes=-2),
        duration_sec=124,
    )
    db.add(call1)
    await db.flush()
    _add_turns(db, call1.id, [
        ("agent", "Thanks for calling Bright Smile Dental! How can I help you today?", 0),
        ("caller", "Hi, I'd like to book a cleaning for next Tuesday at 10am.", 3200),
        ("agent", "Perfect — you're booked for a routine cleaning next Tuesday at "
                  "10:00 AM. Is there anything else I can help with?", 7800),
        ("caller", "No, that's all. Thank you!", 12500),
        ("agent", "You're welcome — see you then!", 14100),
    ])
    db.add(Booking(
        business_id=business_id, call_id=call1.id, customer_name="Dana",
        customer_phone="+1 (555) 240-1180", service_name="Routine Cleaning",
        start_at=_dt(6, 10, 0), duration_min=45, status="confirmed",
    ))

    # Call 2 — an FAQ answered.
    call2 = Call(
        business_id=business_id, caller_number="+1 (555) 771-9930", source="twilio",
        status="completed", outcome="answered", sentiment="neutral",
        summary="Caller asked about pricing for a cleaning.",
        started_at=now - timedelta(hours=6), ended_at=now - timedelta(hours=6, minutes=-1),
        duration_sec=48,
    )
    db.add(call2)
    await db.flush()
    _add_turns(db, call2.id, [
        ("agent", "Thanks for calling Bright Smile Dental! How can I help you today?", 0),
        ("caller", "How much do you charge for a cleaning?", 3100),
        ("agent", "A routine cleaning is $95, and it usually takes about 45 minutes.", 6400),
        ("caller", "Great, thanks.", 9800),
    ])

    # Call 3 — a message taken.
    call3 = Call(
        business_id=business_id, caller_number="+1 (555) 662-3345", source="twilio",
        status="completed", outcome="message", sentiment="neutral",
        summary="Caller left a message about rescheduling.",
        started_at=now - timedelta(days=1), ended_at=now - timedelta(days=1, minutes=-1),
        duration_sec=57,
    )
    db.add(call3)
    await db.flush()
    _add_turns(db, call3.id, [
        ("agent", "Thanks for calling Bright Smile Dental! How can I help you today?", 0),
        ("caller", "I need to reschedule my appointment on Thursday. This is Marcus.", 3400),
        ("agent", "Got it — I've taken your message and the team will get back to "
                  "you shortly. Is there anything else?", 8200),
        ("caller", "That's it, thanks.", 12000),
    ])
    db.add(Message(
        call_id=call3.id, caller_name="Marcus", caller_number="+1 (555) 662-3345",
        body="I need to reschedule my appointment on Thursday. This is Marcus.",
        delivered=False,
    ))

    # A couple more upcoming bookings for the calendar view.
    db.add(Booking(
        business_id=business_id, customer_name="Priya", service_name="New Patient Exam",
        start_at=_dt(1, 14, 0), duration_min=60, status="confirmed",
    ))
    db.add(Booking(
        business_id=business_id, customer_name="Leo", service_name="Teeth Whitening",
        start_at=_dt(2, 11, 30), duration_min=60, status="confirmed",
    ))


def _add_turns(db, call_id: str, turns: list[tuple[str, str, int]]) -> None:
    for seq, (role, text, start_ms) in enumerate(turns):
        db.add(TranscriptTurn(
            call_id=call_id, seq=seq, role=role, text=text, start_ms=start_ms,
            confidence=0.9 if role == "agent" else None,
        ))
