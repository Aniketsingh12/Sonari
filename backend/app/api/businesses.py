"""Agent (business) CRUD: instructions, hours, services, voice, escalation rules.

``router`` is owner-only — main.py mounts it behind the admin gate.
``public_router`` holds the single unauthenticated endpoint that the embeddable
voice agent needs, so the gate can be applied to everything else wholesale.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import current_business_id
from app.db import get_db
from app.models.business import Business, Service
from app.schemas import (
    AgentSummary,
    BusinessCreate,
    BusinessOut,
    BusinessUpdate,
    PublicAgentOut,
    ServiceCreate,
    ServiceOut,
)

router = APIRouter(prefix="/businesses", tags=["businesses"])
public_router = APIRouter(prefix="/businesses", tags=["public"])


async def _get(db: AsyncSession, business_id: str) -> Business:
    result = await db.execute(
        select(Business)
        .where(Business.id == business_id)
        .options(selectinload(Business.services))
    )
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    return biz


@router.get("", response_model=list[AgentSummary])
async def list_agents(db: AsyncSession = Depends(get_db)) -> list[Business]:
    """Every agent the owner has created — powers the multi-agent list view."""
    result = await db.execute(select(Business).order_by(Business.created_at))
    return list(result.scalars())


@router.get("/me", response_model=BusinessOut)
async def get_my_business(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Business:
    return await _get(db, business_id)


@router.delete("/{business_id}", status_code=204)
async def delete_agent(business_id: str, db: AsyncSession = Depends(get_db)):
    # No `-> None`: a 204 must not carry a response body model.
    await _get(db, business_id)  # 404s if it doesn't exist
    # Core DELETE: the DB cascades to services/faqs/calls/bookings via the
    # FK ON DELETE rules (SQLite enforcement enabled in db.py).
    await db.execute(delete(Business).where(Business.id == business_id))


@public_router.get("/{business_id}/agent", response_model=PublicAgentOut)
async def public_agent(business_id: str, db: AsyncSession = Depends(get_db)) -> Business:
    """Unauthenticated config for the embeddable voice agent (anyone with the id).

    Response is limited to public fields by ``PublicAgentOut`` — no owner
    contacts, phone number, or booking internals leak out.
    """
    return await _get(db, business_id)


@router.post("", response_model=BusinessOut, status_code=201)
async def create_business(
    payload: BusinessCreate, db: AsyncSession = Depends(get_db)
) -> Business:
    data = payload.model_dump(exclude={"services"})
    biz = Business(**data)
    biz.services = [Service(**s.model_dump()) for s in payload.services]
    db.add(biz)
    await db.flush()
    await db.refresh(biz, attribute_names=["services"])
    return biz


@router.patch("/me", response_model=BusinessOut)
async def update_my_business(
    payload: BusinessUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Business:
    biz = await _get(db, business_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(biz, field, value)
    await db.flush()
    await db.refresh(biz, attribute_names=["services"])
    return biz


@router.put("/me/services", response_model=list[ServiceOut])
async def replace_services(
    services: list[ServiceCreate],
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> list[Service]:
    biz = await _get(db, business_id)
    biz.services.clear()
    biz.services = [Service(**s.model_dump()) for s in services]
    await db.flush()
    await db.refresh(biz, attribute_names=["services"])
    return biz.services
