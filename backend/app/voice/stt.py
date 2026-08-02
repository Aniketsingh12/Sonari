"""STT helper: transcribe a buffered utterance via the configured provider."""
from __future__ import annotations

from app.providers import get_stt
from app.voice.audio import resample_pcm16


async def transcribe_pcm_at(pcm16: bytes, src_rate: int) -> str:
    """Transcribe PCM16 captured at ``src_rate`` (a phone provider's stream rate).

    Upsamples to 16kHz — what the STT models expect — then transcribes.
    """
    pcm16_16k = resample_pcm16(pcm16, src_rate, 16000)
    provider = get_stt()
    return await provider.transcribe(pcm16_16k, sample_rate=16000)


async def transcribe_pcm(pcm16_8k: bytes) -> str:
    """Back-compat shim: transcribe 8kHz PCM16 (Twilio's rate)."""
    return await transcribe_pcm_at(pcm16_8k, 8000)
