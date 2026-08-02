"""Exotel Voicebot / AgentStream integration.

In the Exotel App Bazaar, add a **Voicebot applet** to your call flow with URL:

    wss://<your PUBLIC_BASE_URL host>/exotel/media

Exotel then streams caller audio to that socket; we run STT → agent → TTS and
stream the reply back. Exotel provides no STT/TTS, so set real providers
(e.g. STT_PROVIDER=groq, TTS_PROVIDER=piper) for audible, understood calls.

``GET /exotel/voicebot`` is an optional convenience: Exotel also accepts an
https applet URL that *returns* the wss endpoint — point the applet here and it
resolves to ``/exotel/media`` from PUBLIC_BASE_URL.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket
from fastapi.responses import JSONResponse

from app.config import settings
from app.telephony.exotel import ExotelStreamAdapter

router = APIRouter(prefix="/exotel", tags=["telephony"])


def _media_ws_url() -> str:
    base = settings.public_base_url
    if base.startswith("https"):
        scheme_rest = "wss" + base[len("https") :]
    elif base.startswith("http"):
        scheme_rest = "ws" + base[len("http") :]
    else:
        scheme_rest = base
    return scheme_rest.rstrip("/") + "/exotel/media"


@router.websocket("/media")
async def exotel_media(ws: WebSocket) -> None:
    await ExotelStreamAdapter().run(ws)


@router.get("/voicebot")
async def exotel_voicebot_url() -> JSONResponse:
    """Return the wss URL Exotel should stream to (for the https-applet mode)."""
    return JSONResponse({"url": _media_ws_url()})
