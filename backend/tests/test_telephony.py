"""Tests for the provider-agnostic telephony adapters (app/telephony/*).

Two layers:
  * pure wire tests — each provider's parse_start / decode_inbound /
    encode_outbound, no DB or network;
  * a shared-loop test — drives StreamingCallAdapter.run() through a fake
    WebSocket with stubbed STT/TTS/agent, proving the start→media→stop
    sequencing, VAD-gated turn, and outbound framing.
"""
from __future__ import annotations

import asyncio
import base64
import json

from fastapi import WebSocketDisconnect

from app.telephony.exotel import ExotelStreamAdapter
from app.telephony.twilio import TwilioStreamAdapter


# ----------------------------- Twilio wire --------------------------------
def test_twilio_parse_start_reads_custom_param_business_id():
    info = TwilioStreamAdapter().parse_start(
        {
            "event": "start",
            "start": {
                "streamSid": "MZ123",
                "customParameters": {"business_id": "biz-1"},
                "from": "+15550001111",
            },
        }
    )
    assert info.stream_sid == "MZ123"
    assert info.business_id == "biz-1"
    assert info.caller_number == "+15550001111"


def test_twilio_encode_outbound_is_mulaw_media_frames():
    adapter = TwilioStreamAdapter()
    frames = [json.loads(f) for f in adapter.encode_outbound(b"\x10\x00" * 200, "MZ1")]
    assert frames, "expected at least one media frame"
    assert all(f["event"] == "media" and f["streamSid"] == "MZ1" for f in frames)
    # decode_inbound is the inverse companding; it should run and yield PCM.
    pcm_back = adapter.decode_inbound(frames[0]["media"]["payload"])
    assert isinstance(pcm_back, bytes) and pcm_back


# ----------------------------- Exotel wire --------------------------------
def test_exotel_parse_start_reads_to_from_and_top_level_stream_sid():
    info = ExotelStreamAdapter().parse_start(
        {
            "event": "start",
            "stream_sid": "ex-stream-1",
            "start": {
                "stream_sid": "ex-stream-1",
                "call_sid": "c1",
                "from": "+919876500000",
                "to": "+911140000000",
                "custom_parameters": {},
            },
        }
    )
    assert info.stream_sid == "ex-stream-1"
    assert info.to_number == "+911140000000"
    assert info.caller_number == "+919876500000"
    assert info.business_id is None


def test_exotel_decode_is_raw_pcm_passthrough():
    pcm = b"\x01\x02\x03\x04"
    payload = base64.b64encode(pcm).decode()
    assert ExotelStreamAdapter().decode_inbound(payload) == pcm  # no companding


def test_exotel_encode_outbound_320_byte_frames_with_chunk_index():
    pcm = b"\x00\x01" * 320  # 640 bytes -> exactly two 320-byte frames
    frames = [json.loads(f) for f in ExotelStreamAdapter().encode_outbound(pcm, "ex-1")]
    assert len(frames) == 2
    assert [f["media"]["chunk"] for f in frames] == [1, 2]
    for f in frames:
        assert f["event"] == "media" and f["stream_sid"] == "ex-1"
        assert len(base64.b64decode(f["media"]["payload"])) == 320


# --------------------------- shared streaming loop -------------------------
class _FakeWS:
    def __init__(self, frames):
        self._frames = list(frames)
        self.sent: list[str] = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if self._frames:
            return self._frames.pop(0)
        raise WebSocketDisconnect(code=1000)

    async def send_text(self, data: str):
        self.sent.append(data)


class _OneShotDetector:
    """Stub VAD that reports end-of-utterance exactly once, on the first frame."""

    def __init__(self, *args, **kwargs):
        self._fired = False

    def push(self, pcm: bytes) -> bool:
        if self._fired:
            return False
        self._fired = True
        return True


class _FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def commit(self):
        pass


def test_streaming_loop_dispatches_turn_and_streams_reply(monkeypatch):
    """start → media (VAD fires) → agent → reply framed back; stop ends it.

    Everything below the adapter (STT, agent, TTS, DB) is stubbed so the test
    checks only what the shared loop owns: event dispatch, VAD-gated turns, and
    provider-specific outbound framing.
    """
    from app.telephony import base as tbase

    async def fake_resolve(self, info):
        return "biz-x"

    async def fake_transcribe(pcm, rate):
        return "what are your hours"

    async def fake_synth(text, rate, voice=None):
        return b"\x00\x01" * 320  # 640 bytes -> two Exotel frames

    async def fake_handle_turn(db, business_id, text, **kwargs):
        assert business_id == "biz-x"
        assert text == "what are your hours"
        assert kwargs.get("source") == "exotel"
        return {
            "call_id": "c1",
            "reply": "We are open nine to five.",
            "intent": "faq",
            "confidence": 1.0,
            "outcome": None,
            "escalated": False,
        }

    async def fake_finalize(db, call_id):
        return None

    monkeypatch.setattr(ExotelStreamAdapter, "_resolve", fake_resolve)
    monkeypatch.setattr(tbase, "transcribe_pcm_at", fake_transcribe)
    monkeypatch.setattr(tbase, "synthesize_pcm16", fake_synth)
    monkeypatch.setattr(tbase, "handle_turn", fake_handle_turn)
    monkeypatch.setattr(tbase, "finalize_call", fake_finalize)
    monkeypatch.setattr(tbase, "SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(tbase, "UtteranceDetector", _OneShotDetector)

    payload = base64.b64encode(b"\x05\x00" * 160).decode()
    frames = [
        json.dumps({"event": "connected"}),  # handshake, should be ignored
        json.dumps(
            {
                "event": "start",
                "stream_sid": "ex-1",
                "start": {
                    "stream_sid": "ex-1",
                    "from": "+919876500000",
                    "to": "+911140000000",
                    "custom_parameters": {},
                },
            }
        ),
        json.dumps({"event": "media", "media": {"payload": payload}}),
        json.dumps({"event": "stop"}),
    ]
    ws = _FakeWS(frames)

    asyncio.run(ExotelStreamAdapter().run(ws))

    assert ws.accepted
    out = [json.loads(s) for s in ws.sent]
    assert len(out) == 2, "reply audio should be framed into two Exotel media msgs"
    assert all(m["event"] == "media" and m["stream_sid"] == "ex-1" for m in out)
    assert [m["media"]["chunk"] for m in out] == [1, 2]
