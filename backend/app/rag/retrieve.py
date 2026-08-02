"""Cosine-similarity FAQ retrieval.

For SQLite portability the vectors live in a JSON column and similarity is
computed in Python. On Postgres/Supabase, swap this for a pgvector
``ORDER BY embedding <=> :query`` query — the interface stays the same.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.faq import Faq
from app.providers import get_embedder


@dataclass
class RetrievedFaq:
    faq: Faq
    score: float


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


async def search_faqs(
    db: AsyncSession, business_id: str, query: str, *, top_k: int = 3
) -> list[RetrievedFaq]:
    embedder = get_embedder()
    (qvec,) = await embedder.embed([query])

    result = await db.execute(select(Faq).where(Faq.business_id == business_id))
    faqs = list(result.scalars())

    scored: list[RetrievedFaq] = []
    for faq in faqs:
        # A stored vector of a different width was written by a different
        # embedding provider, so it can't be compared to this query. Treat it
        # as unembedded rather than silently scoring it 0 — otherwise swapping
        # EMBEDDING_PROVIDER makes every FAQ vanish until a reindex.
        usable = faq.embedding and len(faq.embedding) == len(qvec)
        if usable:
            score = _cosine(qvec, faq.embedding)
        else:
            score = _keyword_overlap(query, f"{faq.question} {faq.answer}")
        scored.append(RetrievedFaq(faq=faq, score=score))

    scored.sort(key=lambda r: r.score, reverse=True)
    return scored[:top_k]


def _keyword_overlap(query: str, doc: str) -> float:
    q = set(query.lower().split())
    d = set(doc.lower().split())
    if not q:
        return 0.0
    return len(q & d) / len(q)
