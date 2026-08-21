"""Spend guards for the public (unauthenticated) endpoints.

The embeddable voice agent has to reach ``/simulate/turn``, ``/tts`` and
``/transcribe`` without a password — which means a shared agent link is also a
way to spend your LLM/STT quota. Two independent limits protect it:

* ``SlidingWindowLimiter`` — per-IP, caps how *fast* one client can call.
* ``DailyBudget`` — global, caps how *much* everyone can spend in a day.

Both are needed. The per-IP window alone is not a spend cap: ten visitors get
ten times the allowance, and ``_client_key`` trusts a header the client can
forge (see its note), so a determined caller can mint a fresh bucket per
request. The daily budget is the ceiling that survives both.

Deliberately simple: in-memory, sized for a single-container deploy. Behind
several replicas each process keeps its own counters (so the effective ceiling
is ``limit * replicas``) and both reset on redeploy — move them to Redis if you
scale out. Neither replaces a spend limit set at the AI provider itself, which
is the only guard that cannot be bypassed by a bug in this file.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Request

from app.api.auth import verify_token
from app.config import settings


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


class DailyBudget:
    """A hard ceiling on public AI calls per UTC day, shared by every caller.

    Fails closed: once the day's allowance is gone the endpoint stops calling
    the provider and returns 429 until midnight UTC, so an unattended deploy
    cannot run up an open-ended bill. Owners are exempt (see ``_is_owner``).
    """

    def __init__(self, limit: int, label: str) -> None:
        self.limit = limit
        self.label = label
        self._day = ""
        self._used = 0

    @property
    def used(self) -> int:
        self._roll()
        return self._used

    def _roll(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._day:
            self._day, self._used = today, 0

    def check(self) -> None:
        if self.limit <= 0:  # 0 = no ceiling
            return
        self._roll()
        if self._used >= self.limit:
            now = datetime.now(timezone.utc)
            midnight = now.replace(hour=23, minute=59, second=59)
            raise HTTPException(
                status_code=429,
                detail=(
                    f"This agent has reached its daily {self.label} limit. "
                    "Please try again tomorrow."
                ),
                headers={"Retry-After": str(max(1, int((midnight - now).total_seconds())))},
            )
        self._used += 1


def _client_key(request: Request) -> str:
    # Behind a proxy (Render/Railway) the real client is the first XFF entry.
    # Caveat: a client can send its own X-Forwarded-For, and a proxy that
    # *appends* rather than replaces leaves that forged value in front — so this
    # key is spoofable and the per-IP window can be reset at will. That is why
    # the daily budget below, which needs no client identity, is the real cap.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_owner(token: str | None) -> bool:
    """True only for a signed-in owner of a password-protected dashboard.

    ``verify_token`` returns True for everyone when no password is set, so the
    ``auth_enabled`` check matters: without it an open deploy would exempt the
    whole internet from the limits below.
    """
    return settings.auth_enabled and verify_token(token)


# Conversation turns hit the LLM: the most expensive path.
_turn_limiter = SlidingWindowLimiter(limit=30, window_sec=60)
# Speech synthesis / transcription: cheaper but still metered.
_media_limiter = SlidingWindowLimiter(limit=60, window_sec=60)

turn_budget = DailyBudget(settings.public_daily_turn_limit, "conversation")
media_budget = DailyBudget(settings.public_daily_media_limit, "audio")


async def limit_turns(
    request: Request, x_admin_token: str | None = Header(default=None)
) -> None:
    if _is_owner(x_admin_token):
        return  # your own dashboard shouldn't consume the public allowance
    _turn_limiter.check(_client_key(request))
    turn_budget.check()


async def limit_media(
    request: Request, x_admin_token: str | None = Header(default=None)
) -> None:
    if _is_owner(x_admin_token):
        return
    _media_limiter.check(_client_key(request))
    media_budget.check()
