"""Twilio Media Streams WebSocket endpoint.

Thin route over :class:`TwilioStreamAdapter` — the real work (VAD → STT → agent
→ TTS) is the shared streaming loop in ``app/telephony/base.py``. Kept at
``/media/twilio`` because ``api/calls.py`` builds that URL when
``USE_MEDIA_STREAM`` is on. Fully exercising it needs a real Twilio call; the
browser simulator covers the same agent logic without telephony.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket

from app.telephony.twilio import TwilioStreamAdapter

router = APIRouter(prefix="/media", tags=["telephony"])


@router.websocket("/twilio")
async def twilio_media(ws: WebSocket) -> None:
    await TwilioStreamAdapter().run(ws)
