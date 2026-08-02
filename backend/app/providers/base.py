"""Abstract provider interfaces shared by open-source, paid, and mock backends."""
from __future__ import annotations

import abc
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class Chunk:
    """A streamed STT partial/final transcript fragment."""

    text: str
    is_final: bool = False


class STTProvider(abc.ABC):
    """Speech-to-text. Consumes PCM audio frames, yields transcript text."""

    name: str = "base"
    mode: str = "mock"  # "open-source" | "paid" | "mock"

    @abc.abstractmethod
    async def transcribe(self, audio: bytes, sample_rate: int = 16000) -> str:
        """Transcribe a complete utterance of raw PCM16 (the telephony path)."""

    async def transcribe_file(self, data: bytes, filename: str = "audio.webm") -> str:
        """Transcribe an encoded audio file (wav/webm/mp3…) — the browser-mic path.

        Default: unsupported (returns empty). Real providers override this."""
        return ""

    async def stream(
        self, frames: AsyncIterator[bytes], sample_rate: int = 16000
    ) -> AsyncIterator[Chunk]:
        """Stream partial transcripts. Default: buffer then transcribe once."""
        buffer = bytearray()
        async for frame in frames:
            buffer.extend(frame)
        text = await self.transcribe(bytes(buffer), sample_rate)
        yield Chunk(text=text, is_final=True)

    def is_available(self) -> tuple[bool, str]:
        return True, ""


class TTSProvider(abc.ABC):
    """Text-to-speech. Produces audio bytes (wav/mp3) from text."""

    name: str = "base"
    mode: str = "mock"
    content_type: str = "audio/wav"

    @abc.abstractmethod
    async def synthesize(self, text: str, voice: str | None = None) -> bytes:
        """Synthesize a whole string to an audio buffer."""

    async def stream(
        self, text: str, voice: str | None = None
    ) -> AsyncIterator[bytes]:
        """Stream audio. Default: synthesize whole then yield once."""
        yield await self.synthesize(text, voice)

    def is_available(self) -> tuple[bool, str]:
        return True, ""


class LLMProvider(abc.ABC):
    """Chat/completion model used by the agent nodes."""

    name: str = "base"
    mode: str = "mock"

    @abc.abstractmethod
    async def complete(
        self,
        system: str,
        messages: list[dict],
        *,
        model: str | None = None,
        temperature: float = 0.3,
        max_tokens: int = 512,
        json_mode: bool = False,
    ) -> str:
        """Return the assistant's text for the given prompt."""

    def is_available(self) -> tuple[bool, str]:
        return True, ""


class Embedder(abc.ABC):
    """Turns text into a vector for RAG similarity search."""

    name: str = "base"
    mode: str = "mock"
    dim: int = 384

    @abc.abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        ...

    def is_available(self) -> tuple[bool, str]:
        return True, ""
