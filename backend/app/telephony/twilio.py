"""Twilio adapters.

Twilio's *text* path (TwiML ``<Gather input="speech">`` / ``<Say>``) lives in
``app/api/calls.py`` — Twilio does the STT/TTS there. This module is Twilio's
*audio-streaming* path (Media Streams), which shares the streaming loop in
``base.py``. Twilio streams 8kHz μ-law; we decode to PCM for the agent and
re-encode μ-law to speak back.
"""
from __future__ import annotations

import base64
import json
from collections.abc import Iterable

from app.telephony.base import StartInfo, StreamingCallAdapter
from app.voice.audio import mulaw_to_pcm16, pcm16_to_mulaw

_FRAME_BYTES = 160  # 20ms of 8kHz μ-law


class TwilioStreamAdapter(StreamingCallAdapter):
    name = "twilio"
    inbound_rate = 8000

    def parse_start(self, msg: dict) -> StartInfo:
        start = msg.get("start", {})
        params = start.get("customParameters", {}) or {}
        # business_id is passed via the TwiML <Parameter> in calls.py; the To/From
        # fallbacks cover configurations that stream without custom parameters.
        return StartInfo(
            stream_sid=start.get("streamSid") or msg.get("streamSid", ""),
            business_id=params.get("business_id"),
            to_number=start.get("to") or params.get("to"),
            caller_number=start.get("from"),
        )

    def decode_inbound(self, payload_b64: str) -> bytes:
        return mulaw_to_pcm16(base64.b64decode(payload_b64))

    def encode_outbound(self, pcm16: bytes, stream_sid: str) -> Iterable[str]:
        mulaw = pcm16_to_mulaw(pcm16)
        for i in range(0, len(mulaw), _FRAME_BYTES):
            frame = mulaw[i : i + _FRAME_BYTES]
            yield json.dumps(
                {
                    "event": "media",
                    "streamSid": stream_sid,
                    "media": {"payload": base64.b64encode(frame).decode()},
                }
            )
