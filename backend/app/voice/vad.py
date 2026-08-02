"""Voice-activity / end-of-utterance detection.

A lightweight energy-gate: once we've seen speech, a run of low-energy frames
longer than ``silence_ms`` marks the end of the caller's utterance. Good enough
for turn-taking on a phone call; swap for webrtcvad or Silero for production.
"""
from __future__ import annotations

import audioop

from app.config import settings


class UtteranceDetector:
    def __init__(
        self,
        sample_rate: int = 8000,
        frame_ms: int = 20,
        silence_ms: int | None = None,
        energy_threshold: int = 500,
    ) -> None:
        self.sample_rate = sample_rate
        self.frame_ms = frame_ms
        self.silence_ms = silence_ms or settings.vad_silence_ms
        self.energy_threshold = energy_threshold
        self._silence_run = 0
        self._has_speech = False

    def reset(self) -> None:
        self._silence_run = 0
        self._has_speech = False

    def push(self, pcm16: bytes) -> bool:
        """Feed a PCM16 frame. Returns True when an utterance has just ended."""
        if not pcm16:
            return False
        energy = audioop.rms(pcm16, 2)
        if energy >= self.energy_threshold:
            self._has_speech = True
            self._silence_run = 0
            return False

        if self._has_speech:
            self._silence_run += self.frame_ms
            if self._silence_run >= self.silence_ms:
                self._has_speech = False
                self._silence_run = 0
                return True
        return False
