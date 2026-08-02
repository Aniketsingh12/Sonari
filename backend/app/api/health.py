"""Health + provider status endpoint."""
from __future__ import annotations

from fastapi import APIRouter

from app import __version__
from app.config import settings
from app.providers import provider_statuses
from app.schemas import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(
        status="ok",
        version=__version__,
        environment=settings.environment,
        providers=provider_statuses(),
    )
