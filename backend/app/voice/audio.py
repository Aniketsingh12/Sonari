"""Audio-format helpers for the Twilio media stream (8kHz μ-law ↔ PCM16)."""
from __future__ import annotations

import audioop


def mulaw_to_pcm16(mulaw: bytes) -> bytes:
    """Twilio sends 8-bit μ-law @ 8kHz; decode to 16-bit linear PCM."""
    return audioop.ulaw2lin(mulaw, 2)


def pcm16_to_mulaw(pcm16: bytes) -> bytes:
    """Encode 16-bit linear PCM back to 8-bit μ-law for Twilio playback."""
    return audioop.lin2ulaw(pcm16, 2)


def resample_pcm16(pcm16: bytes, src_rate: int, dst_rate: int) -> bytes:
    if src_rate == dst_rate:
        return pcm16
    converted, _ = audioop.ratecv(pcm16, 2, 1, src_rate, dst_rate, None)
    return converted
