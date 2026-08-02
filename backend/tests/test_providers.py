"""Provider wiring: selection, reported mode, and Fish Audio request shaping.

No network — these check the parts that break silently: picking the right class,
reporting availability honestly, and (for Fish) not sending a placeholder UI
voice id as a real voice reference.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.providers.tts import FishAudioTTS, build_tts


def test_tts_selection_maps_names_to_providers():
    assert build_tts("fish").name == "fish"
    assert build_tts("piper").name == "piper"
    assert build_tts("elevenlabs").name == "elevenlabs"
    # Unknown names fall back to the mock rather than crashing at startup.
    assert build_tts("nope").name == "mock"


def test_fish_returns_wav_so_it_works_on_the_phone_path():
    """The reason to prefer Fish over ElevenLabs: voice/tts.py can only resample
    WAV, so an MP3-only provider is silent on real calls."""
    assert build_tts("fish").content_type == "audio/wav"
    assert build_tts("elevenlabs").content_type == "audio/mpeg"


def test_fish_reports_unavailable_without_a_key(monkeypatch):
    monkeypatch.setattr(settings, "fish_api_key", None)
    available, detail = build_tts("fish").is_available()
    assert available is False
    assert "FISH_API_KEY" in detail


def test_fish_reports_available_with_a_key(monkeypatch):
    monkeypatch.setattr(settings, "fish_api_key", "sk-test")
    monkeypatch.setattr(settings, "fish_model", "s1")
    available, detail = build_tts("fish").is_available()
    assert available is True
    assert "s1" in detail


@pytest.mark.parametrize("placeholder", ["default", "rachel", "Amy", "MARCUS", "", None])
def test_fish_ignores_the_uis_placeholder_voice_ids(monkeypatch, placeholder):
    """The voice picker sends ids like "default"/"rachel" (and browser voiceURIs).
    Those are not Fish reference ids — sending one would fail the request, so the
    configured voice must win instead."""
    monkeypatch.setattr(settings, "fish_voice_id", "802e3bc2b27e49c2995d23ef70e6ac89")
    assert FishAudioTTS()._reference_id(placeholder) == (
        "802e3bc2b27e49c2995d23ef70e6ac89"
    )


def test_fish_uses_a_real_voice_id_when_one_is_passed(monkeypatch):
    monkeypatch.setattr(settings, "fish_voice_id", "configured-default")
    chosen = FishAudioTTS()._reference_id("7f3a1c9d2b5e4f6a8c0d1e2f3a4b5c6d")
    assert chosen == "7f3a1c9d2b5e4f6a8c0d1e2f3a4b5c6d"


def test_fish_sends_no_reference_id_when_nothing_is_configured(monkeypatch):
    """An empty reference_id must be omitted, not sent as "" — the API would
    reject a blank voice reference."""
    monkeypatch.setattr(settings, "fish_voice_id", "")
    assert FishAudioTTS()._reference_id("default") == ""
