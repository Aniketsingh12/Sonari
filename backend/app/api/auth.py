"""Owner-dashboard authentication.

A single shared password (``ADMIN_PASSWORD``) guards the dashboard API. It is
deliberately simple — this is a single-owner product, not a multi-user SaaS.

Design notes:
* When no password is configured the gate is **open**, so a fresh clone runs with
  zero setup. ``/api/auth/status`` reports that, and the UI warns about it.
* The session token is derived from the password with HMAC, so it stays valid
  across restarts (no server-side session store) and never exposes the password
  itself. Comparisons are constant-time.
* The public voice-agent surface (agent config, simulate, tts, transcribe) and
  the telephony webhooks are intentionally NOT behind this gate.
"""
from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

_TOKEN_NAMESPACE = b"sonari-dashboard-session-v1"


def _expected_token() -> str:
    return hmac.new(
        settings.admin_password.encode("utf-8"), _TOKEN_NAMESPACE, hashlib.sha256
    ).hexdigest()


def verify_token(token: str | None) -> bool:
    if not settings.auth_enabled:
        return True
    if not token:
        return False
    return hmac.compare_digest(token, _expected_token())


async def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency guarding every owner-only endpoint."""
    if not verify_token(x_admin_token):
        raise HTTPException(status_code=401, detail="Dashboard authentication required")


class LoginIn(BaseModel):
    password: str


@router.get("/status")
async def auth_status(x_admin_token: str | None = Header(default=None)) -> dict:
    """Whether a password is configured, and whether this caller is signed in."""
    return {
        "auth_required": settings.auth_enabled,
        "authenticated": verify_token(x_admin_token),
    }


@router.post("/login")
async def login(payload: LoginIn) -> dict:
    if not settings.auth_enabled:
        # Nothing to log into; hand back a token so the client flow is uniform.
        return {"token": "", "auth_required": False}
    if not hmac.compare_digest(payload.password, settings.admin_password):
        raise HTTPException(status_code=401, detail="Incorrect password")
    return {"token": _expected_token(), "auth_required": True}
