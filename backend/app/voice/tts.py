"""TTS helpers: synthesize a reply and encode it for streaming playback.

``synthesize_pcm16`` is the provider-agnostic core (returns linear PCM16 at a
requested rate); ``synthesize_for_twilio`` layers μ-law encoding on top for
Twilio's media stream.
"""
from __future__ import annotations

import io
import wave

from app.providers import get_tts
from app.voice.audio import pcm16_to_mulaw, resample_pcm16


async def synthesize_pcm16(
    text: str, rate: int = 8000, voice: str | None = None
) -> bytes:
    """Return linear PCM16 (mono) at ``rate`` for the given text.

    Works for WAV-producing providers (mock, Piper, Fish Audio). ElevenLabs
    returns MP3 and would need a decoder (ffmpeg) to re-encode — skipped here, so
    the streaming telephony path expects a WAV/PCM provider (Piper or Fish).
    """
    provider = get_tts()
    audio = await provider.synthesize(text, voice)
    if provider.content_type != "audio/wav":
        return b""  # non-PCM payloads need a decoder; skip in the demo path.

    with wave.open(io.BytesIO(audio), "rb") as w:
        src_rate = w.getframerate()
        pcm = w.readframes(w.getnframes())
    return resample_pcm16(pcm, src_rate, rate)


async def synthesize_for_twilio(text: str, voice: str | None = None) -> bytes:
    """Return 8kHz μ-law audio ready to stream back over the Twilio socket."""
    pcm_8k = await synthesize_pcm16(text, 8000, voice)
    if not pcm_8k:
        return b""
    return pcm16_to_mulaw(pcm_8k)
