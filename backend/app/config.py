"""Application settings.

Everything is driven from environment variables (a `.env` file in `backend/`
is loaded automatically). The AI pipeline is fully pluggable: pick an
open-source or a paid provider for each of STT / TTS / LLM, or leave the
defaults ("mock") so the whole app runs end-to-end with no keys or downloads.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

STTProvider = Literal["mock", "faster_whisper", "openai", "groq"]
TTSProvider = Literal["mock", "piper", "elevenlabs", "fish"]
LLMProvider = Literal["mock", "ollama", "anthropic", "openai", "gemini", "together"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- App ----
    app_name: str = "Sonari"
    environment: Literal["development", "production", "test"] = "development"
    debug: bool = True
    # Public base URL of this backend (used to build telephony stream URLs).
    public_base_url: str = "http://localhost:8100"
    # Injected automatically by the host — used when PUBLIC_BASE_URL is left at
    # its local default, so a deploy resolves its own public URL.
    railway_public_domain: str | None = None   # Railway: "app.up.railway.app"
    render_external_url: str | None = None     # Render:  "https://app.onrender.com"
    # Comma-separated list of allowed CORS origins for the frontend.
    cors_origins: str = "http://localhost:5273,http://localhost:3000"

    @property
    def effective_base_url(self) -> str:
        """The URL the outside world reaches this app on.

        An explicit non-local PUBLIC_BASE_URL always wins. Otherwise fall back to
        whatever the platform injected, so Twilio/Exotel callback URLs are right
        on Railway and Render without anyone setting a variable by hand.
        """
        explicit = self.public_base_url.strip().rstrip("/")
        if explicit and "localhost" not in explicit and "127.0.0.1" not in explicit:
            return explicit
        if self.railway_public_domain:
            return f"https://{self.railway_public_domain.strip().rstrip('/')}"
        if self.render_external_url:
            return self.render_external_url.strip().rstrip("/")
        return explicit

    # ---- Dashboard access ----
    # Password for the owner dashboard. Empty (the default) leaves the dashboard
    # OPEN, which keeps local development zero-config. ALWAYS set this on a public
    # deployment: without it, anyone who reaches the URL can read, edit, and
    # delete every agent. The public voice-agent page never requires it.
    admin_password: str = ""

    @property
    def auth_enabled(self) -> bool:
        return bool(self.admin_password.strip())

    # ---- Database ----
    # Default is a local SQLite file; swap for Postgres/Supabase in production:
    #   postgresql+asyncpg://user:pass@host:5432/sonari
    # Cloud hosts (Render/Railway/Heroku) hand out postgres:// URLs — those are
    # normalized to the asyncpg driver automatically (see validator below).
    database_url: str = "sqlite+aiosqlite:///./sonari.db"

    # Absolute or cwd-relative path to the built frontend (index.html + assets).
    # When present, FastAPI serves the SPA itself — the single-container deploy.
    # Empty/missing means API-only (the dev setup, where Vite serves the UI).
    frontend_dist: str = ""

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        # Managed Postgres add-ons give bare postgres://; SQLAlchemy async needs
        # an explicit async driver.
        if v.startswith("postgres://"):
            v = "postgresql+asyncpg://" + v[len("postgres://"):]
        elif v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://"):]
        return v

    # ---- Redis / Celery ----
    redis_url: str = "redis://localhost:6379/0"

    # =================================================================
    # AI PROVIDER SELECTION
    # =================================================================
    stt_provider: STTProvider = "mock"
    tts_provider: TTSProvider = "mock"
    llm_provider: LLMProvider = "mock"
    # A cheaper/faster model can handle routine turns; escalate to a
    # stronger model only when the agent flags a complex turn.
    llm_fast_model: str = "claude-haiku-4-5-20251001"
    llm_strong_model: str = "claude-opus-4-8"

    # ---- Paid API keys (only needed if the matching provider is selected) ----
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # "Rachel" default

    # ---- Fish Audio (paid TTS, ~10x cheaper than ElevenLabs) ----
    # Unlike ElevenLabs it can return WAV/PCM directly, so it works on the
    # phone-call path with no MP3 decoder. Key: https://fish.audio/app/developers
    fish_api_key: str | None = None
    # s1 ($10/M bytes) · s2-pro ($15/M) · s2.1-pro · s2.1-pro-free (free tier)
    fish_model: str = "s1"
    # Voice ("reference") id from fish.audio. Empty = the model's default voice.
    fish_voice_id: str = ""
    # Requested WAV sample rate; the telephony path resamples from this anyway.
    fish_sample_rate: int = 24000

    # ---- Together AI (open-weight models on a hosted, OpenAI-shaped API) ----
    # Key: https://api.together.ai — no local GPU, no Ollama, works in the cloud.
    together_api_key: str | None = None
    # Llama 3.3 70B Turbo: strong instruction-following and reliable JSON, which
    # the receptionist brain needs for intent classification. Swap for a smaller
    # model (e.g. meta-llama/Llama-3.1-8B-Instruct-Turbo) if you want lower
    # latency per turn, which matters in a spoken conversation.
    together_model: str = "meta-llama/Llama-3.3-70B-Instruct-Turbo"

    # ---- Free-tier API models (great for a zero-cost cloud deploy) ----
    # Gemini: free key from https://aistudio.google.com/apikey
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    gemini_embed_model: str = "text-embedding-004"
    # Groq: free key from https://console.groq.com — hosts Whisper for STT.
    groq_api_key: str | None = None
    groq_stt_model: str = "whisper-large-v3-turbo"

    # ---- Open-source model settings ----
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_embed_model: str = "nomic-embed-text"
    faster_whisper_model: str = "base.en"  # tiny.en | base.en | small.en ...
    faster_whisper_device: str = "cpu"     # cpu | cuda
    piper_voice: str = "en_US-amy-medium"
    piper_data_dir: str = "./piper_voices"

    # ---- Embeddings (RAG) ----
    # "hash" = zero-dependency deterministic embedding (good enough for demo);
    # the others use real models when installed/keyed.
    embedding_provider: Literal[
        "hash", "ollama", "sentence_transformers", "openai", "gemini"
    ] = "hash"
    embedding_dim: int = 384

    # ---- Telephony (Twilio) ----
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_phone_number: str | None = None

    # ---- Demo data ----
    # A fresh install starts empty and sends the owner through the setup
    # wizard. Set true to auto-load the sample business on startup instead
    # (handy for a throwaway demo container); the dashboard can also load it
    # on demand via POST /api/demo/seed.
    seed_demo_data: bool = False

    # ---- Agent behaviour ----
    # Silence (ms) that marks the end of a caller utterance.
    vad_silence_ms: int = 700
    # Below this intent confidence the agent escalates to a human.
    escalation_confidence_threshold: float = 0.45

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
