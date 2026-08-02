"""Speech-to-text providers: mock, faster-whisper (open-source), OpenAI (paid)."""
from __future__ import annotations

import asyncio
import importlib.util
import io
import wave

from app.config import settings
from app.providers.base import STTProvider


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


class MockSTT(STTProvider):
    """Returns no audio-derived text.

    The browser simulator sends text directly, so STT is only exercised by the
    real audio path (Twilio). Without a real model we cannot invent words, so
    this returns an empty transcript and lets callers fall back to typed input.
    """

    name = "mock"
    mode = "mock"

    async def transcribe(self, audio: bytes, sample_rate: int = 16000) -> str:
        return ""

    def is_available(self) -> tuple[bool, str]:
        return True, "Echoes typed input; no audio transcription."


class FasterWhisperSTT(STTProvider):
    """Local, open-source streaming Whisper via ``faster-whisper``."""

    name = "faster_whisper"
    mode = "open-source"

    def __init__(self) -> None:
        self._model = None

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel  # type: ignore

            self._model = WhisperModel(
                settings.faster_whisper_model,
                device=settings.faster_whisper_device,
                compute_type="int8",
            )
        return self._model

    async def transcribe(self, audio: bytes, sample_rate: int = 16000) -> str:
        def _run() -> str:
            model = self._load()
            wav = io.BytesIO()
            with wave.open(wav, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(sample_rate)
                w.writeframes(audio)
            wav.seek(0)
            segments, _ = model.transcribe(wav, beam_size=1, language="en")
            return " ".join(s.text for s in segments).strip()

        return await asyncio.to_thread(_run)

    async def transcribe_file(self, data: bytes, filename: str = "audio.webm") -> str:
        # faster-whisper decodes any container (webm/ogg/mp3/wav) via PyAV.
        def _run() -> str:
            model = self._load()
            segments, _ = model.transcribe(io.BytesIO(data), beam_size=1)
            return " ".join(s.text for s in segments).strip()

        return await asyncio.to_thread(_run)

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("faster_whisper"):
            return False, "pip install faster-whisper"
        return True, f"model={settings.faster_whisper_model}"


def _pcm_to_wav_bytes(audio: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(audio)
    return buf.getvalue()


class OpenAISTT(STTProvider):
    """Paid Whisper via the OpenAI API."""

    name = "openai"
    mode = "paid"

    async def transcribe(self, audio: bytes, sample_rate: int = 16000) -> str:
        return await self._call("audio.wav", _pcm_to_wav_bytes(audio, sample_rate))

    async def transcribe_file(self, data: bytes, filename: str = "audio.webm") -> str:
        return await self._call(filename, data)

    async def _call(self, filename: str, data: bytes) -> str:
        from openai import AsyncOpenAI  # type: ignore

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        f = io.BytesIO(data)
        f.name = filename
        resp = await client.audio.transcriptions.create(model="whisper-1", file=f)
        return (resp.text or "").strip()

    def is_available(self) -> tuple[bool, str]:
        if not _module_available("openai"):
            return False, "pip install openai"
        if not settings.openai_api_key:
            return False, "set OPENAI_API_KEY"
        return True, "model=whisper-1"


class GroqSTT(STTProvider):
    """Free-tier Whisper via the Groq API (whisper-large-v3-turbo, very fast).

    OpenAI-compatible transcription endpoint, called over httpx so no SDK is
    needed. A free key comes from https://console.groq.com.
    """

    name = "groq"
    mode = "free-api"  # hosted API with a generous free tier

    async def transcribe(self, audio: bytes, sample_rate: int = 16000) -> str:
        return await self._call("audio.wav", _pcm_to_wav_bytes(audio, sample_rate))

    async def transcribe_file(self, data: bytes, filename: str = "audio.webm") -> str:
        return await self._call(filename, data)

    async def _call(self, filename: str, data: bytes) -> str:
        import httpx

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                files={"file": (filename, data)},
                data={"model": settings.groq_stt_model, "response_format": "json"},
            )
            resp.raise_for_status()
            return (resp.json().get("text") or "").strip()

    def is_available(self) -> tuple[bool, str]:
        if not settings.groq_api_key:
            return False, "set GROQ_API_KEY (free: console.groq.com)"
        return True, f"model={settings.groq_stt_model}"


def build_stt(provider: str) -> STTProvider:
    return {
        "mock": MockSTT,
        "faster_whisper": FasterWhisperSTT,
        "openai": OpenAISTT,
        "groq": GroqSTT,
    }.get(provider, MockSTT)()
