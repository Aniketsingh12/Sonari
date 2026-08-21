"""Spend guards on the public endpoints.

These are the only thing standing between a shared agent link and an unbounded
AI bill, so they get tested like a security control rather than a nicety.
"""
import pytest

from app.api.ratelimit import DailyBudget


@pytest.fixture
def budgets(monkeypatch):
    """Give the app a tiny, isolated daily allowance for one test."""
    from app.api import ratelimit

    turn = DailyBudget(limit=2, label="conversation")
    monkeypatch.setattr(ratelimit, "turn_budget", turn)
    return turn


def test_daily_budget_blocks_once_the_allowance_is_gone(client, business_id, budgets):
    body = {"business_id": business_id, "text": "hello"}
    assert client.post("/api/simulate/turn", json=body).status_code == 200
    assert client.post("/api/simulate/turn", json=body).status_code == 200

    blocked = client.post("/api/simulate/turn", json=body)
    assert blocked.status_code == 429
    assert "daily" in blocked.json()["detail"].lower()
    # A client that respects Retry-After shouldn't hammer us until midnight.
    assert int(blocked.headers["Retry-After"]) > 0


def test_budget_is_not_reset_by_spoofing_the_client_ip(client, business_id, budgets):
    """The per-IP window can be dodged with a forged header; the budget can't."""
    body = {"business_id": business_id, "text": "hello"}
    for i in range(2):
        client.post(
            "/api/simulate/turn", json=body, headers={"X-Forwarded-For": f"10.0.0.{i}"}
        )

    blocked = client.post(
        "/api/simulate/turn", json=body, headers={"X-Forwarded-For": "10.0.0.99"}
    )
    assert blocked.status_code == 429


def test_signed_in_owner_is_exempt(client, business_id, budgets, monkeypatch):
    """Hitting the public cap must never lock the owner out of their own agent."""
    from app.api.auth import _expected_token
    from app.config import settings

    body = {"business_id": business_id, "text": "hello"}
    for _ in range(3):
        client.post("/api/simulate/turn", json=body)
    assert client.post("/api/simulate/turn", json=body).status_code == 429

    monkeypatch.setattr(settings, "admin_password", "s3cret")
    owner = {"X-Admin-Token": _expected_token()}
    assert client.post("/api/simulate/turn", json=body, headers=owner).status_code == 200


def test_zero_limit_disables_the_cap():
    budget = DailyBudget(limit=0, label="conversation")
    for _ in range(50):
        budget.check()  # must not raise


def test_health_reports_usage_and_whether_the_dashboard_is_open(client):
    body = client.get("/api/health").json()
    assert body["usage"]["turns_limit"] > 0
    # A fresh test run has no ADMIN_PASSWORD, which health must report honestly.
    assert body["dashboard_protected"] is False
