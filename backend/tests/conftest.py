"""Test fixtures: an isolated SQLite database and a seeded TestClient."""
import asyncio
import os

import pytest

# Use a throwaway database file so tests never touch a real one.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_sonari.db")

# Pin the deterministic providers regardless of what .env selects. Otherwise a
# developer with LLM_PROVIDER=ollama gets slow, non-deterministic tests that
# fail whenever Ollama happens to be down. Env vars win over .env.
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("TTS_PROVIDER", "mock")
os.environ.setdefault("STT_PROVIDER", "mock")
os.environ.setdefault("EMBEDDING_PROVIDER", "hash")


TEST_DB_FILE = "./test_sonari.db"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.db import SessionLocal, init_db
    from app.main import app
    from app.seed import business_count, create_demo_business

    # Start from an empty database every run. Otherwise agents created by a
    # previous run linger and tests that depend on "which agent exists" drift.
    for suffix in ("", "-wal", "-shm"):
        path = TEST_DB_FILE + suffix
        if os.path.exists(path):
            os.remove(path)

    # A fresh install starts empty, so the sample business is loaded
    # explicitly here rather than by a startup hook.
    async def _prep():
        await init_db()
        async with SessionLocal() as db:
            if not await business_count(db):
                await create_demo_business(db)
                await db.commit()

    asyncio.run(_prep())
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def business_id(client):
    return client.get("/api/businesses/me").json()["id"]
