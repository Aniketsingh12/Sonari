"""Turn FAQ entries into embeddings so they can be retrieved during a call."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.faq import Faq
from app.providers import get_embedder


def _doc_text(faq: Faq) -> str:
    return f"{faq.question}\n{faq.answer}"


async def embed_faq(db: AsyncSession, faq: Faq) -> None:
    """Compute and store the embedding for a single FAQ."""
    embedder = get_embedder()
    (vec,) = await embedder.embed([_doc_text(faq)])
    faq.embedding = vec
    await db.flush()


async def reindex_business(db: AsyncSession, business_id: str) -> int:
    """(Re)embed every FAQ for a business. Returns the count indexed."""
    embedder = get_embedder()
    result = await db.execute(select(Faq).where(Faq.business_id == business_id))
    faqs = list(result.scalars())
    if not faqs:
        return 0
    vectors = await embedder.embed([_doc_text(f) for f in faqs])
    for faq, vec in zip(faqs, vectors):
        faq.embedding = vec
    await db.flush()
    return len(faqs)
