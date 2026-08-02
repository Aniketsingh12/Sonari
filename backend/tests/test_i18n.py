"""The agent's per-business language: catalogue integrity + it reaches replies."""
from datetime import datetime, timezone

import pytest

from app.agent.i18n import (
    LANGUAGES,
    MESSAGES,
    base_of,
    closing_phrases,
    format_datetime,
    t,
)

# Every message key that must exist in every language.
_REQUIRED_KEYS = set(MESSAGES["en"].keys())


@pytest.mark.parametrize("code", list(LANGUAGES.keys()))
def test_every_language_has_every_message(code):
    base = base_of(code)
    assert base in MESSAGES, f"no catalogue for {code}"
    missing = _REQUIRED_KEYS - set(MESSAGES[base].keys())
    assert not missing, f"{code} missing keys: {missing}"


@pytest.mark.parametrize("code", list(LANGUAGES.keys()))
def test_templates_render_without_leftover_placeholders(code):
    dt = datetime(2026, 7, 21, 10, 0, tzinfo=timezone.utc)
    booking = t(code, "booking_confirmed", name=", Sam", service="x",
                when=format_datetime(code, dt))
    assert "{" not in booking and "}" not in booking
    assert t(code, "escalate_phone", phone="123").count("{") == 0


def test_unknown_language_falls_back_to_english():
    assert t("xx-YY", "closing") == MESSAGES["en"]["closing"]
    assert base_of(None) == "en"


def test_localized_dates_use_the_local_month_name():
    dt = datetime(2026, 7, 21, 10, 0, tzinfo=timezone.utc)
    assert "julio" in format_datetime("es-ES", dt)     # Spanish
    assert "juillet" in format_datetime("fr-FR", dt)   # French
    assert "जुलाई" in format_datetime("hi-IN", dt)      # Hindi


def test_closing_detection_includes_local_and_english():
    es = closing_phrases("es-ES")
    assert "eso es todo" in es      # Spanish
    assert "that's all" in es       # English still accepted (code-switching)


def test_business_language_persists_and_defaults(client, business_id):
    # The seeded demo business is English by default.
    me = client.get("/api/businesses/me").json()
    assert me["language"] == "en-US"

    # And a business can be switched to another language.
    r = client.patch("/api/businesses/me", json={"language": "es-ES"})
    assert r.status_code == 200
    assert r.json()["language"] == "es-ES"
    # restore so other tests see English
    client.patch("/api/businesses/me", json={"language": "en-US"})
