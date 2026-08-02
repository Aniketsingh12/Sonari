"""Cached factories that resolve the configured provider for each capability."""
from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.providers.base import Embedder, LLMProvider, STTProvider, TTSProvider
from app.providers.embedding import build_embedder
from app.providers.llm import build_llm
from app.providers.stt import build_stt
from app.providers.tts import build_tts
from app.schemas import ProviderStatus


@lru_cache
def get_stt() -> STTProvider:
    return build_stt(settings.stt_provider)


@lru_cache
def get_tts() -> TTSProvider:
    return build_tts(settings.tts_provider)


@lru_cache
def get_llm() -> LLMProvider:
    return build_llm(settings.llm_provider)


@lru_cache
def get_embedder() -> Embedder:
    return build_embedder(settings.embedding_provider)


def provider_statuses() -> list[ProviderStatus]:
    """Report the selected provider and its availability for the health endpoint."""
    out: list[ProviderStatus] = []
    for kind, prov in (
        ("stt", get_stt()),
        ("tts", get_tts()),
        ("llm", get_llm()),
        ("embedding", get_embedder()),
    ):
        available, detail = prov.is_available()
        out.append(
            ProviderStatus(
                kind=kind,
                provider=prov.name,
                mode=prov.mode,
                available=available,
                detail=detail,
            )
        )
    return out
