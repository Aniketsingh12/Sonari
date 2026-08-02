"""Twilio Voice webhooks.

Two working paths are provided:

1. ``/call/incoming`` + ``/call/gather`` — uses Twilio's built-in speech
   recognition (``<Gather input="speech">``) and ``<Say>``. This runs the full
   agent with zero extra infra and is the recommended MVP path.
2. ``<Connect><Stream>`` to ``/media/twilio`` — the low-latency streaming path
   (see ``media.py``) that pipes raw audio through our own STT/TTS providers.

Set ``USE_MEDIA_STREAM`` below to switch ``/call/incoming`` to the streaming path.
"""
from __future__ import annotations

from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
# Number → business routing is shared across every provider (see telephony/base).
from app.telephony.base import resolve_business as _business_for_number
from app.services.call_service import finalize_call, handle_turn

router = APIRouter(prefix="/call", tags=["telephony"])

USE_MEDIA_STREAM = False  # flip to True to use the raw media-stream pipeline


def _twiml(body: str) -> Response:
    xml = f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>'
    return Response(content=xml, media_type="application/xml")


@router.post("/incoming")
async def incoming_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
    To: str | None = Form(default=None),
    From: str | None = Form(default=None),
    CallSid: str | None = Form(default=None),
) -> Response:
    biz = await _business_for_number(db, To)
    if not biz or not biz.agent_live:
        return _twiml("<Say>Sorry, this line is not available right now.</Say>")

    greeting = escape(biz.greeting)
    lang = escape(biz.language or "en-US")  # BCP-47, used by both STT and TTS

    if USE_MEDIA_STREAM:
        ws_url = settings.public_base_url.replace("http", "ws", 1) + "/media/twilio"
        return _twiml(
            f'<Say language="{lang}">{greeting}</Say>'
            f'<Connect><Stream url="{escape(ws_url)}">'
            f'<Parameter name="business_id" value="{biz.id}"/>'
            f"</Stream></Connect>"
        )

    return _twiml(
        f'<Gather input="speech" action="/call/gather" method="POST" '
        f'speechTimeout="auto" language="{lang}">'
        f'<Say language="{lang}">{greeting}</Say>'
        f"</Gather>"
        f'<Redirect method="POST">/call/gather</Redirect>'
    )


@router.post("/gather")
async def gather(
    db: AsyncSession = Depends(get_db),
    SpeechResult: str | None = Form(default=None),
    From: str | None = Form(default=None),
    To: str | None = Form(default=None),
    CallSid: str | None = Form(default=None),
) -> Response:
    biz = await _business_for_number(db, To)
    if not biz:
        return _twiml("<Say>Goodbye.</Say><Hangup/>")
    lang = escape(biz.language or "en-US")

    if not SpeechResult:
        return _twiml(
            f'<Gather input="speech" action="/call/gather" method="POST" '
            f'speechTimeout="auto" language="{lang}"><Say language="{lang}">'
            f"{escape(biz.greeting)}</Say></Gather><Hangup/>"
        )

    result = await handle_turn(
        db,
        biz.id,
        SpeechResult,
        caller_number=From,
        source="twilio",
        twilio_sid=CallSid,
    )
    reply = escape(result["reply"])

    if result["escalated"]:
        owner = biz.owner_phone
        if owner:
            return _twiml(f'<Say language="{lang}">{reply}</Say><Dial>{escape(owner)}</Dial>')
        return _twiml(f'<Say language="{lang}">{reply}</Say><Hangup/>')

    # Continue the conversation.
    return _twiml(
        f'<Gather input="speech" action="/call/gather" method="POST" '
        f'speechTimeout="auto" language="{lang}"><Say language="{lang}">{reply}'
        f'</Say></Gather><Hangup/>'
    )


@router.post("/status")
async def call_status(
    db: AsyncSession = Depends(get_db),
    CallSid: str | None = Form(default=None),
    CallStatus: str | None = Form(default=None),
) -> Response:
    """Twilio status callback. On completion, run the post-call finalizer."""
    if CallStatus in {"completed", "busy", "failed", "no-answer"} and CallSid:
        from app.models.call import Call

        call_row = await db.execute(select(Call).where(Call.twilio_sid == CallSid))
        call = call_row.scalar_one_or_none()
        if call:
            await finalize_call(db, call.id)
    return Response(status_code=204)
