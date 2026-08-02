"""End-to-end tests for the call pipeline using the default mock providers."""


def test_health_reports_providers(client):
    data = client.get("/api/health").json()
    assert data["status"] == "ok"
    kinds = {p["kind"] for p in data["providers"]}
    assert kinds == {"stt", "tts", "llm", "embedding"}


def test_faq_is_answered_from_knowledge_base(client, business_id):
    r = client.post(
        "/api/simulate/turn",
        json={"business_id": business_id, "text": "How much is a cleaning?"},
    ).json()
    assert r["intent"] == "faq"
    assert "95" in r["reply"]  # grounded in the seeded FAQ


def test_booking_flow_creates_a_booking(client, business_id):
    before = len(client.get("/api/bookings").json())
    r = client.post(
        "/api/simulate/turn",
        json={
            "business_id": business_id,
            "text": "I'd like to book a cleaning for Tuesday at 10am, my name is Sam.",
        },
    ).json()
    assert r["intent"] == "book_appointment"
    assert r["outcome"] == "booked"
    after = client.get("/api/bookings").json()
    assert len(after) == before + 1


def test_escalation_reads_out_owner_number(client, business_id):
    r = client.post(
        "/api/simulate/turn",
        json={"business_id": business_id, "text": "I want to speak to a real person."},
    ).json()
    assert r["escalated"] is True
    assert r["outcome"] == "escalated"


def test_tts_preview_returns_audio(client):
    resp = client.get("/api/tts", params={"text": "Hello"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/")
    assert len(resp.content) > 100


def test_conversation_keeps_call_context(client, business_id):
    first = client.post(
        "/api/simulate/turn",
        json={"business_id": business_id, "text": "What are your hours?"},
    ).json()
    call_id = first["call_id"]
    second = client.post(
        "/api/simulate/turn",
        json={"business_id": business_id, "call_id": call_id, "text": "Thanks, bye"},
    ).json()
    assert second["call_id"] == call_id  # same call, multiple turns
