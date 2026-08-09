"""Text-to-speech providers.

mock (WAV beep-tone) · Piper (open-source, local) · Fish Audio (paid, WAV) ·
ElevenLabs (paid, MP3 — browser only, see ``app/voice/tts.py``).
"""
from __future__ import annotations

import asyncio
import importlib.util
import io
import math
import struct
import wave

from app.config import settings
from app.providers.base import TTSProvider


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


class MockTTS(TTSProvider):
    """No server-side voice.

    The dashboard detects this and speaks with the browser's own system voices
    instead, so you hear real speech with nothing installed. This tone is only
    reached over the phone path (Twilio), where there's no browser to fall back
    to — configure Piper or ElevenLabs before taking real calls.
    """

    name = "mock"
    mode = "mock"
    content_type = "audio/wav"

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        sample_rate = 16000
        # ~60ms of audio per word, clamped to a sensible range.
        words = max(1, len(text.split()))
        seconds = min(6.0, max(0.4, words * 0.28))
        n = int(sample_rate * seconds)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            frames = bytearray()
            for i in range(n):
                # Gentle two-tone warble with a fade so it reads as "speech-ish".
                env = min(1.0, i / 400, (n - i) / 400)
                freq = 210 + 40 * math.sin(i / 900.0)
                val = int(6000 * env * math.sin(2 * math.pi * freq * i / sample_rate))
                frames += struct.pack("<h", val)
            w.writeframes(bytes(frames))
        return buf.getvalue()

    def is_available(self) -> tuple[bool, str]:
        return True, "Browser speaks in-app; no voice for phone calls."


class PiperTTS(TTSProvider):
    """Local, open-source, free voices via Piper."""

    name = "piper"
    mode = "open-source"
    content_type = "audio/wav"

    def __init__(self) -> None:
        self._voice = None

    def _load(self):
        if self._voice is None:
            from piper.voice import PiperVoice  # type: ignore

            path = f"{settings.piper_data_dir}/{settings.piper_voice}.onnx"
            self._voice = PiperVoice.load(path)
        return self._voice

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        def _run() -> bytes:
            v = self._load()
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                v.synthesize(text, w)
            return buf.getvalue()

        return await asyncio.to_thread(_run)

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("piper"):
            return False, "pip install piper-tts + download a voice"
        return True, f"voice={settings.piper_voice}"


class ElevenLabsTTS(TTSProvider):
    """Paid, high-quality streaming TTS via ElevenLabs."""

    name = "elevenlabs"
    mode = "paid"
    content_type = "audio/mpeg"

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        import httpx

        voice_id = voice or settings.elevenlabs_voice_id
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        headers = {
            "xi-api-key": settings.elevenlabs_api_key or "",
            "accept": "audio/mpeg",
            "content-type": "application/json",
        }
        payload = {
            "text": text,
            "model_id": "eleven_turbo_v2_5",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.content

    def is_available(self) -> tuple[bool, str]:
        if not settings.elevenlabs_api_key:
            return False, "set ELEVENLABS_API_KEY"
        return True, f"voice={settings.elevenlabs_voice_id}"


def _looks_like_fish_voice_id(value: str) -> bool:
    """Fish "reference" ids are long hex strings (e.g. 802e3bc2b27e…).

    Anything else reaching us is a leftover from another voice source — the UI's
    placeholder ids, or a browser voiceURI like "Microsoft David - English
    (United States)". Sending one of those as reference_id fails the request, so
    we detect the real shape rather than blocklisting known-bad values.
    """
    v = value.strip()
    return len(v) >= 16 and all(c in "0123456789abcdefABCDEF" for c in v)


class FishAudioTTS(TTSProvider):
    """Paid TTS via Fish Audio — cheaper than ElevenLabs, and WAV-capable.

    Returns WAV (not MP3), so unlike :class:`ElevenLabsTTS` this also works on
    the streaming telephony path, which needs linear PCM it can resample.
    """

    name = "fish"
    mode = "paid"
    content_type = "audio/wav"

    def _reference_id(self, voice: str | None) -> str:
        """Which Fish voice to speak with: the agent's own, else the configured
        default, else empty (the model's stock voice)."""
        candidate = (voice or "").strip()
        if _looks_like_fish_voice_id(candidate):
            return candidate
        return settings.fish_voice_id.strip()

    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        import httpx

        payload: dict = {
            "text": text,
            "format": "wav",
            "sample_rate": settings.fish_sample_rate,
        }
        reference_id = self._reference_id(voice)
        if reference_id:
            payload["reference_id"] = reference_id

        headers = {
            "Authorization": f"Bearer {settings.fish_api_key or ''}",
            "Content-Type": "application/json",
            # Selects the backend model (s1 / s2-pro / s2.1-pro / s2.1-pro-free).
            "model": settings.fish_model,
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.fish.audio/v1/tts", headers=headers, json=payload
            )
            resp.raise_for_status()
            return resp.content

    def is_available(self) -> tuple[bool, str]:
        if not settings.fish_api_key:
            return False, "set FISH_API_KEY"
        voice = settings.fish_voice_id or "default voice"
        return True, f"{settings.fish_model} · {voice}"


def build_tts(provider: str) -> TTSProvider:
    return {
        "mock": MockTTS,
        "piper": PiperTTS,
        "elevenlabs": ElevenLabsTTS,
        "fish": FishAudioTTS,
    }.get(provider, MockTTS)()
