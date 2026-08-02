"""Notification tool: send the owner a post-call summary via SMS/WhatsApp.

Falls back to logging when Twilio isn't configured, so it's safe to call in the
default setup. Wire ``TWILIO_*`` settings to send real messages.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import SessionLocal
from app.models.business import Business
from app.models.call import Call

logger = logging.getLogger("sonari.notify")


def _format_summary(call: Call, business: Business) -> str:
    lines = [f"📞 New call for {business.name}"]
    if call.caller_number:
        lines.append(f"From: {call.caller_number}")
    if call.outcome:
        lines.append(f"Outcome: {call.outcome}")
    if call.summary:
        lines.append(call.summary)
    if call.messages:
        lines.append(f"Message: {call.messages[0].body}")
    return "\n".join(lines)


async def send_owner_summary(call_id: str) -> bool:
    """Send (or log) the owner summary for a completed call."""
    async with SessionLocal() as db:
        result = await db.execute(
            select(Call)
            .where(Call.id == call_id)
            .options(selectinload(Call.messages), selectinload(Call.business))
        )
        call = result.scalar_one_or_none()
        if not call:
            return False
        business = call.business
        body = _format_summary(call, business)

    if not (settings.twilio_account_sid and settings.twilio_auth_token):
        logger.info("[notify:stub] would send to %s:\n%s", business.owner_phone, body)
        return False

    try:  # pragma: no cover - requires real Twilio
        from twilio.rest import Client

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            to=business.owner_phone,
            from_=settings.twilio_phone_number,
            body=body,
        )
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Owner notification failed: %s", exc)
        return False
