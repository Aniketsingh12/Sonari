"""A fresh install starts empty and is configured through the setup wizard.

These run against their own database so the empty state is real, rather than
the sample business the other tests rely on.
"""
import asyncio
import os

import pytest

TEST_DB = "./test_onboarding.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB}"


@pytest.fixture(scope="module")
def fresh_client():
    """A client backed by an empty database — no business, no sample data."""
    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

    from fastapi.testclient import TestClient

    import app.config as config_mod
    import app.db as db_mod

    # Save the shared DB binding so we can restore it — otherwise later test
    # modules would keep talking to this throwaway database.
    orig_url = config_mod.settings.database_url
    orig_engine = db_mod.engine
    orig_session = db_mod.SessionLocal

    # Point the engine at the throwaway database for this module.
    config_mod.settings.database_url = f"sqlite+aiosqlite:///{TEST_DB}"
    db_mod.engine = db_mod._make_engine()
    db_mod.SessionLocal = db_mod.async_sessionmaker(
        db_mod.engine, expire_on_commit=False, class_=db_mod.AsyncSession
    )

    from app.main import app

    asyncio.run(db_mod.init_db())
    try:
        with TestClient(app) as c:
            yield c
    finally:
        config_mod.settings.database_url = orig_url
        db_mod.engine = orig_engine
        db_mod.SessionLocal = orig_session
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)


def test_fresh_install_has_no_business(fresh_client):
    # The dashboard uses this 404 to decide to show the setup wizard.
    assert fresh_client.get("/api/businesses/me").status_code == 404


def test_wizard_creates_a_business_of_any_vertical(fresh_client):
    payload = {
        "name": "Shear Genius Salon",
        "industry": "Hair salon",
        "greeting": "Thanks for calling Shear Genius!",
        "owner_phone": "+1 (555) 010-2030",
        "timezone": "America/New_York",
        "hours": {"mon": ["09:00", "18:00"], "sun": None},
        "max_bookings_per_day": 24,
        "services": [
            {"name": "Haircut", "duration_min": 30, "price": 45.0},
            {"name": "Colour", "duration_min": 90, "price": 130.0},
        ],
    }
    r = fresh_client.post("/api/businesses", json=payload)
    assert r.status_code == 201
    biz = r.json()
    assert biz["name"] == "Shear Genius Salon"
    assert biz["onboarding_complete"] is True
    assert len(biz["services"]) == 2

    # Now the dashboard resolves the tenant instead of 404ing.
    me = fresh_client.get("/api/businesses/me").json()
    assert me["id"] == biz["id"]


def test_agent_answers_using_that_businesss_own_knowledge(fresh_client):
    biz_id = fresh_client.get("/api/businesses/me").json()["id"]
    fresh_client.post(
        "/api/faqs",
        json={"question": "How much is a haircut?", "answer": "A haircut is $45."},
    )
    r = fresh_client.post(
        "/api/simulate/turn",
        json={"business_id": biz_id, "text": "How much is a haircut?"},
    ).json()
    # Nothing dental anywhere — the agent speaks this salon's own knowledge.
    assert "45" in r["reply"]


def test_demo_seed_refuses_when_a_business_exists(fresh_client):
    r = fresh_client.post("/api/demo/seed")
    assert r.status_code == 409


def test_reset_returns_to_a_fresh_install(fresh_client):
    assert fresh_client.post("/api/demo/reset").status_code == 204
    assert fresh_client.get("/api/businesses/me").status_code == 404

    # And the sample business can then be loaded on demand.
    r = fresh_client.post("/api/demo/seed")
    assert r.status_code == 201
    assert r.json()["name"] == "Bright Smile Dental"


def test_stale_business_id_header_does_not_lock_the_client_out(fresh_client):
    """A client caching an id from a deleted business must still resolve.

    Otherwise reset -> re-seed leaves the dashboard stuck on a 404 forever,
    because the browser keeps sending the old X-Business-Id.
    """
    current = fresh_client.get("/api/businesses/me").json()["id"]

    r = fresh_client.get(
        "/api/businesses/me", headers={"X-Business-Id": "deadbeef" * 4}
    )
    assert r.status_code == 200
    assert r.json()["id"] == current
