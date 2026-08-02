"""Shared API dependencies.

Auth is intentionally light for the MVP: a single seeded demo business is the
default tenant. In production, replace ``current_business_id`` with Supabase
JWT verification that maps the authenticated user to their business.
"""
from __future__ import annotations

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.business import Business


async def current_business_id(
    db: AsyncSession = Depends(get_db),
    x_business_id: str | None = Header(default=None),
) -> str:
    """Resolve the active business.

    Uses the ``X-Business-Id`` header when present (the frontend sends it),
    otherwise falls back to the first business in the database (demo tenant).

    The header is only honoured if it actually resolves. A client that cached an
    id which has since been deleted (e.g. after a reset) would otherwise be
    locked out with a permanent 404 even once a new business exists.
    """
    if x_business_id:
        found = await db.execute(
            select(Business.id).where(Business.id == x_business_id)
        )
        if found.scalar_one_or_none():
            return x_business_id

    # Ordered so the fallback is stable: with several agents, an unordered
    # LIMIT 1 lets the "active" agent change between requests.
    result = await db.execute(
        select(Business.id).order_by(Business.created_at).limit(1)
    )
    row = result.scalars().first()
    return row or ""
