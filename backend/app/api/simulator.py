"""In-browser call simulator + TTS preview.

Lets you exercise the full STT→agent→TTS pipeline with no Twilio account:
type (or speak, transcribed client-side) a caller message, get the agent's
reply as text and synthesized audio. Also powers the voice-preview player.
"""
from __future__ import annotations

import urllib.parse

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ratelimit import limit_media, limit_turns
from app.db import SessionLocal, get_db
from app.providers import get_stt, get_tts
from app.schemas import SimulateTurnIn, SimulateTurnOut
from app.services.call_service import finalize_call, handle_turn

router = APIRouter(tags=["simulator"])

# Cap on an uploaded clip. A voice turn is seconds long; anything much larger is
# a mistake or an attempt to make us buy expensive transcription.
MAX_AUDIO_BYTES = 8 * 1024 * 1024  # 8 MB


@router.post("/transcribe", dependencies=[Depends(limit_media)])
async def transcribe(audio: UploadFile = File(...)) -> dict:
    """Transcribe a recorded audio clip with the configured STT provider.

    Lets the browser mic use real Whisper (Groq/OpenAI/faster-whisper) instead of
    the browser's own recognition. Returns ``{"text": "", "provider": ...}`` when
    STT is the mock, so the client can fall back to Web Speech.
    """
    provider = get_stt()
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio clip too large")
    text = ""
    if provider.name != "mock" and data:
        text = await provider.transcribe_file(data, audio.filename or "audio.webm")
    return {"text": text, "provider": provider.name}


@router.post(
    "/simulate/turn",
    response_model=SimulateTurnOut,
    dependencies=[Depends(limit_turns)],
)
async def simulate_turn(
    payload: SimulateTurnIn, db: AsyncSession = Depends(get_db)
) -> SimulateTurnOut:
    result = await handle_turn(
        db,
        payload.business_id,
        payload.text,
        call_id=payload.call_id,
        source="simulator",
    )
    audio_url = "/api/tts?" + urllib.parse.urlencode({"text": result["reply"]})
    return SimulateTurnOut(audio_url=audio_url, **result)


@router.post("/simulate/{call_id}/hangup", status_code=204)
async def simulate_hangup(call_id: str, db: AsyncSession = Depends(get_db)):
    # No `-> None` annotation: FastAPI would infer NoneType as a response model
    # and reject it, since a 204 must not have a body.
    await finalize_call(db, call_id)


@router.get("/tts", dependencies=[Depends(limit_media)])
async def tts_preview(
    text: str = Query(..., max_length=800),
    voice: str | None = Query(default=None),
) -> Response:
    """Synthesize text to audio using the configured TTS provider."""
    provider = get_tts()
    audio = await provider.synthesize(text, voice)
    return Response(content=audio, media_type=provider.content_type)


@router.websocket("/simulate/ws")
async def simulate_ws(websocket: WebSocket) -> None:
    """Streaming variant: JSON in ``{business_id, call_id?, text}``,
    JSON out ``{type: 'reply', ...}`` per turn. Keeps the call open until the
    socket closes, then runs the post-call finalizer."""
    await websocket.accept()
    call_id: str | None = None
    business_id: str | None = None
    try:
        while True:
            data = await websocket.receive_json()
            business_id = data.get("business_id", business_id)
            text = data.get("text", "")
            if not business_id or not text:
                await websocket.send_json({"type": "error", "detail": "missing fields"})
                continue
            async with SessionLocal() as db:
                result = await handle_turn(
                    db, business_id, text, call_id=call_id, source="simulator"
                )
                await db.commit()
            call_id = result["call_id"]
            await websocket.send_json({"type": "reply", **result})
    except WebSocketDisconnect:
        if call_id:
            async with SessionLocal() as db:
                await finalize_call(db, call_id)
                await db.commit()
