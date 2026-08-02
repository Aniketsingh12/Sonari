"""The provider-agnostic core of the telephony layer.

Every phone provider (Twilio, Exotel, Plivo, Vonage, …) speaks its own wire
format, but they all reduce to the same job:

    get the caller's words  ->  run the shared agent brain  ->  speak the reply

That shared job lives here, so a new provider is a thin *adapter* (codec + field
names + framing), never a reimplementation of the agent.

Providers cluster into two shapes:

* **Text webhook** — the provider does STT/TTS and hands us text (Twilio TwiML
  and its compatibles: SignalWire, Telnyx). Request/response; handled in
  ``app/api/calls.py``.
* **Audio WebSocket** — the provider streams raw audio and we do STT/TTS
  ourselves (Twilio Media Streams, Exotel AgentStream, Plivo AudioStream, …).
  Handled by :class:`StreamingCallAdapter` below — subclass it and fill in the
  three wire hooks; the VAD → STT → agent → TTS loop is written once, here.
"""
from __future__ import annotations

import abc
import json
from collections.abc import Iterable
from dataclasses import dataclass

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models.business import Business
from app.services.call_service import finalize_call, handle_turn
from app.voice.stt import transcribe_pcm_at
from app.voice.tts import synthesize_pcm16
from app.voice.vad import UtteranceDetector


async def resolve_business(db: AsyncSession, to_number: str | None) -> Business | None:
    """Map the dialed number to its business.

    Falls back to the first (sole/demo) business when the number doesn't match —
    which is exactly the single-tenant case running today. With several tenants,
    each must have its provider number saved (Settings → Phone number) so the
    dialed number routes to the right one.
    """
    if to_number:
        result = await db.execute(
            select(Business).where(Business.phone_number == to_number)
        )
        biz = result.scalar_one_or_none()
        if biz:
            return biz
    result = await db.execute(select(Business).limit(1))
    return result.scalar_one_or_none()


@dataclass
class StartInfo:
    """Normalized 'call started' facts pulled from a provider's start frame."""

    stream_sid: str
    business_id: str | None = None
    to_number: str | None = None
    caller_number: str | None = None


class TelephonyAdapter(abc.ABC):
    """Marker base shared by every provider integration."""

    name: str = "base"


class StreamingCallAdapter(TelephonyAdapter):
    """Shared driver for the audio-over-WebSocket family.

    Subclasses supply only the provider-specific wire details:

    * :meth:`parse_start`     — read the provider's ``start`` frame → StartInfo
    * :meth:`decode_inbound`  — one inbound media payload → PCM16 @ ``inbound_rate``
    * :meth:`encode_outbound` — reply PCM16 → provider ``media`` messages

    The end-of-utterance detection, transcription, agent turn, synthesis and
    call finalization are all handled once in :meth:`run`.
    """

    # Sample rate (Hz) of the PCM the provider streams to us / expects back.
    inbound_rate: int = 8000

    # ---- provider-specific hooks --------------------------------------------
    @abc.abstractmethod
    def parse_start(self, msg: dict) -> StartInfo:
        """Extract :class:`StartInfo` from the provider's ``start`` frame."""

    @abc.abstractmethod
    def decode_inbound(self, payload_b64: str) -> bytes:
        """Decode one inbound media payload to PCM16 at ``inbound_rate``."""

    @abc.abstractmethod
    def encode_outbound(self, pcm16: bytes, stream_sid: str) -> Iterable[str]:
        """Frame reply PCM16 into provider media messages (JSON strings to send)."""

    def event_of(self, msg: dict) -> str:
        """Name of the event in a frame. Override if a provider nests it."""
        return msg.get("event", "")

    # ---- the shared loop ----------------------------------------------------
    async def run(self, ws: WebSocket) -> None:
        await ws.accept()
        detector = UtteranceDetector(sample_rate=self.inbound_rate)
        pcm_buffer = bytearray()
        info: StartInfo | None = None
        business_id = ""
        call_id: str | None = None

        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                event = self.event_of(msg)

                if event == "start":
                    info = self.parse_start(msg)
                    business_id = await self._resolve(info)
                    if not business_id:
                        break  # unknown number or agent offline — nothing to say
                    continue

                if event == "media":
                    if not info or not business_id:
                        continue
                    pcm = self.decode_inbound(msg["media"]["payload"])
                    pcm_buffer.extend(pcm)
                    if detector.push(pcm):
                        utterance = bytes(pcm_buffer)
                        pcm_buffer.clear()
                        call_id = await self._respond(
                            ws, info, business_id, utterance, call_id
                        )
                    continue

                if event == "stop":
                    break
                # Any other event (e.g. a 'connected' handshake) is ignored.
        except WebSocketDisconnect:
            pass
        finally:
            if call_id:
                async with SessionLocal() as db:
                    await finalize_call(db, call_id)
                    await db.commit()

    async def _resolve(self, info: StartInfo) -> str:
        """Resolve StartInfo → a live business id, or '' if none/offline."""
        async with SessionLocal() as db:
            if info.business_id:
                found = await db.execute(
                    select(Business).where(Business.id == info.business_id)
                )
                biz = found.scalar_one_or_none()
                if biz:
                    return biz.id if biz.agent_live else ""
            biz = await resolve_business(db, info.to_number)
            if biz and biz.agent_live:
                return biz.id
        return ""

    async def _respond(
        self,
        ws: WebSocket,
        info: StartInfo,
        business_id: str,
        utterance_pcm: bytes,
        call_id: str | None,
    ) -> str | None:
        """Transcribe one utterance, run the agent, stream the reply back."""
        text = await transcribe_pcm_at(utterance_pcm, self.inbound_rate)
        if not text:
            return call_id
        async with SessionLocal() as db:
            result = await handle_turn(
                db,
                business_id,
                text,
                call_id=call_id,
                source=self.name,
                caller_number=info.caller_number,
            )
            await db.commit()
        reply_pcm = await synthesize_pcm16(result["reply"], self.inbound_rate)
        if reply_pcm:
            for frame in self.encode_outbound(reply_pcm, info.stream_sid):
                await ws.send_text(frame)
        return result["call_id"]
