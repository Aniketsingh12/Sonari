"""Provider wiring: selection, reported mode, and Fish Audio request shaping.

No network — these check the parts that break silently: picking the right class,
reporting availability honestly, and (for Fish) not sending a placeholder UI
voice id as a real voice reference.
"""
from __future__ import annotations

import pytest

from app.config import settings
from app.providers.llm import TogetherLLM, _strip_code_fence, build_llm
from app.providers.tts import FishAudioTTS, TogetherTTS, build_tts


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


@pytest.mark.parametrize(
    "not_a_fish_id",
    [
        "default",
        "rachel",
        "Amy",
        "MARCUS",
        "",
        None,
        # A leftover browser voiceURI, which is what an agent created while
        # TTS_PROVIDER=mock actually has stored in voice_id.
        "Microsoft David - English (United States)",
        "com.apple.voice.compact.en-US.Samantha",
        "short1234",  # hex but too short to be a reference id
    ],
)
def test_fish_ignores_voice_ids_that_arent_fish_references(monkeypatch, not_a_fish_id):
    """Only a real Fish reference id may be sent; everything else falls back to
    the configured voice, otherwise the request fails."""
    monkeypatch.setattr(settings, "fish_voice_id", "802e3bc2b27e49c2995d23ef70e6ac89")
    assert FishAudioTTS()._reference_id(not_a_fish_id) == (
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


# ------------------------------------------------------------------ Together AI
def test_together_is_selectable_and_reports_paid():
    assert build_llm("together").name == "together"
    assert build_llm("together").mode == "paid"


def test_together_reports_unavailable_without_a_key(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", None)
    available, detail = build_llm("together").is_available()
    assert available is False and "TOGETHER_API_KEY" in detail


def test_together_reports_the_configured_model(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", "sk-test")
    monkeypatch.setattr(settings, "together_model", "meta-llama/Llama-3.3-70B-Instruct-Turbo")
    available, detail = build_llm("together").is_available()
    assert available is True and "Llama-3.3-70B" in detail


@pytest.mark.parametrize(
    "raw, expected",
    [
        ('```json\n{"a": 1}\n```', '{"a": 1}'),          # the common case
        ('```\n{"a": 1}\n```', '{"a": 1}'),              # unlabelled fence
        ('{"a": 1}', '{"a": 1}'),                         # already clean
        ('  {"a": 1}  ', '{"a": 1}'),                     # padded
        ('```json\n{"a": 1}', '{"a": 1}'),                # unterminated fence
    ],
)
def test_code_fences_are_stripped_so_json_parses(raw, expected):
    """Open-weight models wrap JSON in markdown even when told not to; the
    agent's json.loads would fail on the fence."""
    import json as _json

    out = _strip_code_fence(raw)
    assert out == expected
    _json.loads(out)  # the whole point: it must be parseable


def test_together_json_mode_asks_for_raw_json_and_unwraps_the_reply(monkeypatch):
    """End-to-end shaping: the system prompt gains a no-fence instruction, and a
    fenced reply still comes back parseable."""
    import asyncio
    import json as _json

    import httpx

    monkeypatch.setattr(settings, "together_api_key", "sk-test")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = _json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '```json\n{"intent": "faq"}\n```'}}]},
        )

    base = httpx.AsyncClient

    class Stub(base):
        def __init__(self, *a, **kw):
            super().__init__(*a, transport=httpx.MockTransport(handler), **kw)

    monkeypatch.setattr(httpx, "AsyncClient", Stub)

    out = asyncio.run(
        TogetherLLM().complete("Classify.", [{"role": "user", "content": "hi"}], json_mode=True)
    )

    assert captured["url"] == "https://api.together.ai/v1/chat/completions"
    assert captured["auth"] == "Bearer sk-test"
    # System prompt is first, and carries the no-fence instruction.
    assert captured["body"]["messages"][0]["role"] == "system"
    assert "no markdown code fences" in captured["body"]["messages"][0]["content"]
    assert _json.loads(out) == {"intent": "faq"}


# ------------------------------------------------------- Together AI (speech)
def test_together_tts_is_selectable_and_returns_wav():
    """WAV (not MP3) is what makes a TTS usable on the streaming telephony path."""
    p = build_tts("together")
    assert p.name == "together"
    assert p.content_type == "audio/wav"


def test_together_tts_needs_the_same_key_as_the_llm(monkeypatch):
    monkeypatch.setattr(settings, "together_api_key", None)
    available, detail = build_tts("together").is_available()
    assert available is False and "TOGETHER_API_KEY" in detail


@pytest.mark.parametrize("voice", ["af_heart", "am_adam", "bf_alice", "cove"])
def test_together_accepts_real_voice_names(monkeypatch, voice):
    monkeypatch.setattr(settings, "together_voice", "af_heart")
    assert TogetherTTS()._voice(voice) == voice


@pytest.mark.parametrize(
    "not_a_voice",
    [
        "default",
        "rachel",
        "",
        None,
        "Microsoft David - English (United States)",   # browser voiceURI
        "com.apple.voice.compact.en-US.Samantha",
        "802e3bc2b27e49c2995d23ef70e6ac89",            # a Fish reference id
    ],
)
def test_together_falls_back_when_the_voice_isnt_a_together_name(monkeypatch, not_a_voice):
    """An agent created under another engine still holds that engine's voice id;
    passing it through would fail the request."""
    monkeypatch.setattr(settings, "together_voice", "af_heart")
    assert TogetherTTS()._voice(not_a_voice) == "af_heart"


def test_together_tts_request_matches_the_documented_contract(monkeypatch):
    import asyncio
    import json as _json

    import httpx

    monkeypatch.setattr(settings, "together_api_key", "sk-test")
    monkeypatch.setattr(settings, "together_tts_model", "hexgrad/Kokoro-82M")
    monkeypatch.setattr(settings, "together_voice", "af_heart")
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = _json.loads(request.content)
        return httpx.Response(200, content=b"RIFFfake")

    base = httpx.AsyncClient

    class Stub(base):
        def __init__(self, *a, **kw):
            super().__init__(*a, transport=httpx.MockTransport(handler), **kw)

    monkeypatch.setattr(httpx, "AsyncClient", Stub)
    audio = asyncio.run(TogetherTTS().synthesize("Hello"))

    assert captured["url"] == "https://api.together.ai/v1/audio/speech"
    assert captured["auth"] == "Bearer sk-test"
    assert captured["body"] == {
        "model": "hexgrad/Kokoro-82M",
        "input": "Hello",
        "voice": "af_heart",
        "response_format": "wav",
    }
    assert audio == b"RIFFfake"
