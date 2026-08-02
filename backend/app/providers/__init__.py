"""Pluggable AI providers.

Each capability (STT, TTS, LLM, embeddings) is defined by a small abstract
base class with two concrete families of implementations:

    * open-source / local — faster-whisper, Piper, Ollama, sentence-transformers
    * paid API            — OpenAI, ElevenLabs, Anthropic

Plus a dependency-free ``mock`` implementation for every capability, so the
whole application runs end-to-end with no API keys and no model downloads.

The active provider for each capability is chosen in ``app.config.settings``
and resolved by the factories in ``app.providers.factory``.
"""
from app.providers.factory import (
    get_embedder,
    get_llm,
    get_stt,
    get_tts,
    provider_statuses,
)

__all__ = [
    "get_stt",
    "get_tts",
    "get_llm",
    "get_embedder",
    "provider_statuses",
]
