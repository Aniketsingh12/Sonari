"""Health + provider status endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from app import __version__
# Imported as a module, not by name: the budgets are read live on each request
# (and swapped wholesale in tests), so binding the objects here would snapshot them.
from app.api import ratelimit
from app.config import settings
from app.providers import provider_statuses
from app.schemas import HealthOut, UsageOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(
        status="ok",
        version=__version__,
        environment=settings.environment,
        providers=provider_statuses(),
        dashboard_protected=settings.auth_enabled,
        usage=UsageOut(
            turns_used=ratelimit.turn_budget.used,
            turns_limit=ratelimit.turn_budget.limit,
            media_used=ratelimit.media_budget.used,
            media_limit=ratelimit.media_budget.limit,
        ),
    )
