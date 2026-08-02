"""Small in-process rate limiter for the public (unauthenticated) endpoints.

The embeddable voice agent has to reach ``/simulate/turn``, ``/tts`` and
``/transcribe`` without a password — which means a shared agent link is also a
way to spend your LLM/STT quota. This caps how fast any single client can do
that.

Deliberately simple: a per-IP sliding window held in memory. That's the right
size for a single-container deploy. Behind several replicas each process keeps
its own counter, so move to Redis if you scale out.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_sec: int) -> None:
        self.limit = limit
        self.window = window_sec
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        cutoff = now - self.window
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= self.limit:
            retry = max(1, int(hits[0] + self.window - now))
            raise HTTPException(
                status_code=429,
                detail="Too many requests — please slow down.",
                headers={"Retry-After": str(retry)},
            )
        hits.append(now)
        # Keep the map from growing without bound on a long-running process.
        if len(self._hits) > 5000:
            for k in [k for k, v in self._hits.items() if not v]:
                self._hits.pop(k, None)


def _client_key(request: Request) -> str:
    # Behind a proxy (Render/Railway) the real client is the first XFF entry.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Conversation turns hit the LLM: the most expensive path.
_turn_limiter = SlidingWindowLimiter(limit=30, window_sec=60)
# Speech synthesis / transcription: cheaper but still metered.
_media_limiter = SlidingWindowLimiter(limit=60, window_sec=60)


async def limit_turns(request: Request) -> None:
    _turn_limiter.check(_client_key(request))


async def limit_media(request: Request) -> None:
    _media_limiter.check(_client_key(request))
