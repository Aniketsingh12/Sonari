"""Async SQLAlchemy database setup.

Defaults to a local SQLite file so the project runs with zero infrastructure.
Point ``DATABASE_URL`` at Postgres/Supabase for production.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def _make_engine() -> AsyncEngine:
    kwargs: dict = {"echo": False, "future": True}
    if settings.is_sqlite:
        # check_same_thread is a SQLite-only concern.
        kwargs["connect_args"] = {"check_same_thread": False}
    else:
        kwargs["pool_pre_ping"] = True
    return create_async_engine(settings.database_url, **kwargs)


engine: AsyncEngine = _make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


def _configure_sqlite(engine_: AsyncEngine) -> None:
    """Per-connection SQLite pragmas. No-op for Postgres.

    * foreign_keys=ON  — enforce FK constraints (incl. ON DELETE CASCADE);
      without it, deleting an agent would orphan its conversations.
    * journal_mode=WAL — let a reader and a writer work concurrently instead of
      blocking each other.
    * busy_timeout     — a turn holds its transaction open across a slow LLM
      call; make a second concurrent write wait for the lock rather than
      failing immediately with "database is locked".
    """
    from sqlalchemy import event

    @event.listens_for(engine_.sync_engine, "connect")
    def _set_pragmas(dbapi_connection, _record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=15000")  # 15s
        cursor.close()


if settings.is_sqlite:
    _configure_sqlite(engine)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a request-scoped session."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Columns added after the initial schema shipped. ``create_all`` never ALTERs an
# existing table, so we add any missing ones here (idempotent) rather than force a
# DB reset. Postgres deployments should use real migrations; this keeps the
# zero-setup SQLite dev/demo path working across upgrades.
_SQLITE_MIGRATIONS = [
    "ALTER TABLE businesses ADD COLUMN system_prompt TEXT",
    "ALTER TABLE businesses ADD COLUMN agent_type VARCHAR(40) DEFAULT 'assistant'",
    # twilio_number → phone_number: the field holds any provider's number
    # (Exotel, Plivo…), not just Twilio's. No-op on databases already renamed.
    "ALTER TABLE businesses RENAME COLUMN twilio_number TO phone_number",
]


async def init_db() -> None:
    """Create tables. Import models first so they register on ``Base.metadata``."""
    from app import models  # noqa: F401  (side-effect: registers models)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.is_sqlite:
            for ddl in _SQLITE_MIGRATIONS:
                try:
                    await conn.exec_driver_sql(ddl)
                except Exception:
                    pass  # column already exists — nothing to do
