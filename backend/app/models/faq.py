"""FAQ / knowledge-base entry, with a cached embedding for RAG retrieval."""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models._mixins import IDMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.business import Business


class Faq(IDMixin, TimestampMixin, Base):
    __tablename__ = "faqs"

    business_id: Mapped[str] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | website

    # Embedding stored as a JSON array. On Postgres you'd use a pgvector column;
    # JSON keeps the demo portable to SQLite. Cosine similarity is done in Python.
    embedding: Mapped[list | None] = mapped_column(JSON)

    business: Mapped["Business"] = relationship(back_populates="faqs")
