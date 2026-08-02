"""The agent builder: instruction-driven brain, agent CRUD, public config, auth.

These cover the pivot from "one receptionist" to "many voice agents": an agent's
``system_prompt`` *is* its behaviour, agents can be listed/deleted, the public
embed endpoint leaks nothing private, and the owner dashboard can be locked.
"""
from __future__ import annotations

import pytest

from app.agent.general import build_system_prompt


# --------------------------------------------------------------- system prompt
def test_system_prompt_carries_instructions_and_knowledge():
    prompt = build_system_prompt(
        "Professor Ada",
        "You are a patient maths tutor. Never give the final answer outright.",
        "- Refund policy: 30 days",
        "en-US",
    )
    assert "Professor Ada" in prompt
    assert "patient maths tutor" in prompt
    assert "Refund policy: 30 days" in prompt
    # It is spoken aloud, so the model must be told to avoid markdown.
    assert "markdown" in prompt.lower()


def test_system_prompt_requests_the_agents_language_only_when_not_english():
    assert "es-ES" in build_system_prompt("A", "instructions", "", "es-ES")
    # English is the model default; no need to spend prompt on it.
    assert "en-US" not in build_system_prompt("A", "instructions", "", "en-US")


def test_system_prompt_survives_empty_instructions_and_knowledge():
    prompt = build_system_prompt("Helper", "", "", None)
    assert "Helper" in prompt and prompt.strip()


# ------------------------------------------------------------ brain selection
@pytest.fixture(scope="module")
def tutor_id(client):
    """An instruction-driven agent (not the structured receptionist)."""
    r = client.post(
        "/api/businesses",
        json={
            "name": "Professor Ada",
            "agent_type": "tutor",
            "greeting": "What shall we learn?",
            "system_prompt": "You are a patient maths tutor.",
        },
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_instruction_driven_agent_chats_instead_of_booking(client, tutor_id):
    """A tutor must never fall into the receptionist's booking/escalation flow."""
    r = client.post(
        "/api/simulate/turn",
        json={"business_id": tutor_id, "text": "can you explain fractions"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] == "chat"
    assert body["outcome"] == "answered"
    assert body["escalated"] is False
    assert body["reply"].strip()


def test_receptionist_still_uses_the_structured_brain(client):
    """Regression guard: agents without instructions keep intent classification.

    Creates its own receptionist rather than leaning on whichever agent happens
    to be "active", so the assertion can't drift as other tests add agents.
    """
    receptionist = client.post(
        "/api/businesses", json={"name": "Front Desk", "system_prompt": None}
    ).json()["id"]
    r = client.post(
        "/api/simulate/turn",
        json={"business_id": receptionist, "text": "I'd like to book an appointment"},
    )
    assert r.status_code == 200
    # The booking graph classifies intents; it never reports the general "chat".
    assert r.json()["intent"] != "chat"


# ------------------------------------------------------------------ agent CRUD
def test_agents_are_listed_with_their_type(client, tutor_id):
    agents = client.get("/api/businesses").json()
    assert isinstance(agents, list) and len(agents) >= 2
    tutor = next(a for a in agents if a["id"] == tutor_id)
    assert tutor["name"] == "Professor Ada"
    assert tutor["agent_type"] == "tutor"


def test_deleting_an_agent_removes_it_and_its_data(client):
    created = client.post(
        "/api/businesses",
        json={
            "name": "Disposable",
            "system_prompt": "You are temporary.",
            "services": [{"name": "Thing", "duration_min": 15, "price": 5}],
        },
    ).json()
    agent_id = created["id"]
    assert created["services"], "fixture should have a service to cascade"

    assert client.delete(f"/api/businesses/{agent_id}").status_code == 204
    # Gone from the list, and its public config 404s.
    assert agent_id not in [a["id"] for a in client.get("/api/businesses").json()]
    assert client.get(f"/api/businesses/{agent_id}/agent").status_code == 404


def test_deleting_an_unknown_agent_is_404(client):
    assert client.delete("/api/businesses/does-not-exist").status_code == 404


# --------------------------------------------------------------- public config
def test_public_agent_config_exposes_only_safe_fields(client, tutor_id):
    body = client.get(f"/api/businesses/{tutor_id}/agent").json()
    assert body["name"] == "Professor Ada"
    assert set(body) == {
        "id", "name", "industry", "greeting", "language", "voice_id", "agent_type",
    }
    # Owner contact details and telephony config must never reach the embed.
    for leaked in ("owner_phone", "owner_email", "phone_number", "hours",
                   "system_prompt"):
        assert leaked not in body


# ------------------------------------------------------------------------ auth
@pytest.fixture
def locked(monkeypatch):
    """Turn on the dashboard password for one test."""
    from app.config import settings

    monkeypatch.setattr(settings, "admin_password", "s3cret")
    return "s3cret"


def test_owner_endpoints_require_the_password(client, locked):
    assert client.get("/api/businesses").status_code == 401
    assert client.delete("/api/businesses/anything").status_code == 401
    assert client.post("/api/demo/reset").status_code == 401


def test_public_surface_stays_open_when_locked(client, locked, tutor_id):
    assert client.get("/api/health").status_code == 200
    assert client.get(f"/api/businesses/{tutor_id}/agent").status_code == 200
    turn = client.post(
        "/api/simulate/turn", json={"business_id": tutor_id, "text": "hello"}
    )
    assert turn.status_code == 200


def test_login_rejects_the_wrong_password(client, locked):
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401


def test_login_returns_a_token_that_unlocks_the_dashboard(client, locked):
    token = client.post("/api/auth/login", json={"password": locked}).json()["token"]
    assert token
    headers = {"X-Admin-Token": token}
    assert client.get("/api/businesses", headers=headers).status_code == 200
    status = client.get("/api/auth/status", headers=headers).json()
    assert status == {"auth_required": True, "authenticated": True}


def test_dashboard_is_open_when_no_password_is_configured(client):
    # Default config ships without a password so a fresh clone just runs.
    assert client.get("/api/businesses").status_code == 200
    assert client.get("/api/auth/status").json()["auth_required"] is False
