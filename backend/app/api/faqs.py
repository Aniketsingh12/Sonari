"""FAQ knowledge-base CRUD. Each write (re)computes the RAG embedding."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_business_id
from app.db import get_db
from app.models.faq import Faq
from app.rag.ingest import embed_faq, reindex_business
from app.schemas import FaqCreate, FaqOut, FaqUpdate

router = APIRouter(prefix="/faqs", tags=["faqs"])


@router.post("/reindex")
async def reindex(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> dict:
    """Re-embed every FAQ with the current embedding provider.

    Run this after changing EMBEDDING_PROVIDER — vectors from a different model
    aren't comparable, so retrieval falls back to keyword matching until then.
    """
    count = await reindex_business(db, business_id)
    return {"reindexed": count}


@router.get("", response_model=list[FaqOut])
async def list_faqs(
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> list[Faq]:
    result = await db.execute(
        select(Faq).where(Faq.business_id == business_id).order_by(Faq.created_at)
    )
    return list(result.scalars())


@router.post("", response_model=FaqOut, status_code=201)
async def create_faq(
    payload: FaqCreate,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Faq:
    faq = Faq(business_id=business_id, **payload.model_dump())
    db.add(faq)
    await db.flush()
    await embed_faq(db, faq)
    return faq


@router.patch("/{faq_id}", response_model=FaqOut)
async def update_faq(
    faq_id: str,
    payload: FaqUpdate,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
) -> Faq:
    faq = await db.get(Faq, faq_id)
    if not faq or faq.business_id != business_id:
        raise HTTPException(404, "FAQ not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(faq, field, value)
    await db.flush()
    await embed_faq(db, faq)
    return faq


@router.delete("/{faq_id}", status_code=204)
async def delete_faq(
    faq_id: str,
    db: AsyncSession = Depends(get_db),
    business_id: str = Depends(current_business_id),
):
    # No `-> None` annotation: FastAPI would infer NoneType as a response model
    # and reject it, since a 204 must not have a body.
    faq = await db.get(Faq, faq_id)
    if not faq or faq.business_id != business_id:
        raise HTTPException(404, "FAQ not found")
    await db.delete(faq)
