"""Load or clear the sample business.

Sonari ships empty — the owner sets up their own business in the wizard.
These endpoints back the dashboard's "Load demo data" / "Start over" actions so
you can get a populated dashboard for a demo without hand-entering everything.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.db import get_db
from app.models.business import Business
from app.schemas import BusinessOut
from app.seed import business_count, create_demo_business, reset_all

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/seed", response_model=BusinessOut, status_code=201)
async def seed_demo(db: AsyncSession = Depends(get_db)) -> Business:
    """Create the sample business. Refuses if one already exists."""
    if await business_count(db):
        raise HTTPException(
            409, "A business already exists. Reset first to load the demo."
        )
    biz = await create_demo_business(db)
    await db.flush()
    result = await db.execute(
        select(Business)
        .where(Business.id == biz.id)
        .options(selectinload(Business.services))
    )
    return result.scalar_one()


@router.post("/reset", status_code=204)
async def reset_demo(db: AsyncSession = Depends(get_db)):
    """Delete every business and all its data, returning to a fresh install."""
    await reset_all(db)
