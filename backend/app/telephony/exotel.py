"""Exotel Voicebot / AgentStream adapter (audio-over-WebSocket, family B).

Exotel streams the caller's audio to a WebSocket and expects reply audio back on
the same socket. It does **no** STT/TTS itself, so this adapter runs the app's
configured providers — set real ones for a working call (e.g. STT_PROVIDER=groq,
TTS_PROVIDER=piper). With the mock STT the caller is transcribed as empty and the
agent stays silent, which is the honest "not wired to real speech yet" state.

Wire format (per Exotel AgentStream docs):
  * Inbound: JSON events ``connected`` / ``start`` / ``media`` / ``stop``.
    ``media.payload`` is base64 raw/slin **PCM16, 8kHz mono, little-endian**
    (default; 16k/24k are selectable on the applet via a ?sample-rate= query).
  * ``start`` carries ``stream_sid``, ``call_sid``, ``from``, ``to``,
    ``custom_parameters`` and ``media_format``.
  * Outbound: ``media`` events whose base64 payload is PCM16, chunked in
    multiples of 320 bytes (20ms @ 8kHz), with an incrementing ``chunk`` index.

Configure an Exotel Voicebot applet with URL
``wss://<PUBLIC_BASE_URL host>/exotel/media``.
"""
from __future__ import annotations

import base64
import json
from collections.abc import Iterable

from app.telephony.base import StartInfo, StreamingCallAdapter

# Exotel requires outbound payloads in multiples of 320 bytes; 320 bytes of
# PCM16 @ 8kHz = 160 samples = 20ms per frame.
_FRAME_BYTES = 320


class ExotelStreamAdapter(StreamingCallAdapter):
    name = "exotel"
    inbound_rate = 8000  # Exotel default; the applet can raise this to 16k/24k.

    def parse_start(self, msg: dict) -> StartInfo:
        start = msg.get("start", {})
        params = start.get("custom_parameters", {}) or {}
        return StartInfo(
            # stream_sid appears both top-level and inside `start`.
            stream_sid=msg.get("stream_sid") or start.get("stream_sid", ""),
            business_id=params.get("business_id"),
            to_number=start.get("to") or params.get("to"),
            caller_number=start.get("from"),
        )

    def decode_inbound(self, payload_b64: str) -> bytes:
        # Exotel already sends linear PCM16 — nothing to decompand.
        return base64.b64decode(payload_b64)

    def encode_outbound(self, pcm16: bytes, stream_sid: str) -> Iterable[str]:
        chunk = 0
        for i in range(0, len(pcm16), _FRAME_BYTES):
            frame = pcm16[i : i + _FRAME_BYTES]
            if len(frame) < _FRAME_BYTES:  # pad to the required 320-byte boundary
                frame = frame + b"\x00" * (_FRAME_BYTES - len(frame))
            chunk += 1
            yield json.dumps(
                {
                    "event": "media",
                    "stream_sid": stream_sid,
                    "media": {
                        "chunk": chunk,
                        "timestamp": str(chunk * 20),
                        "payload": base64.b64encode(frame).decode(),
                    },
                }
            )
