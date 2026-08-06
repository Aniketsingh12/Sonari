"""Settings resolution that deploys depend on.

The public base URL is what telephony callbacks are built from, so getting it
wrong on a host means Exotel/Twilio dial a URL that doesn't exist.
"""
from __future__ import annotations

import pytest

from app.config import Settings


def test_local_default_when_nothing_is_injected():
    assert Settings().effective_base_url == "http://localhost:8100"


def test_railway_domain_is_used_when_public_base_url_is_still_local():
    s = Settings(railway_public_domain="sonari-prod.up.railway.app")
    assert s.effective_base_url == "https://sonari-prod.up.railway.app"


def test_render_external_url_is_used_when_public_base_url_is_still_local():
    s = Settings(render_external_url="https://sonari.onrender.com")
    assert s.effective_base_url == "https://sonari.onrender.com"


def test_explicit_public_base_url_beats_the_platform_value():
    """An operator pointing at ngrok (or a custom domain) must win — otherwise
    local phone testing would silently call the deployed instance."""
    s = Settings(
        public_base_url="https://ab12.ngrok-free.app",
        railway_public_domain="sonari.up.railway.app",
    )
    assert s.effective_base_url == "https://ab12.ngrok-free.app"


@pytest.mark.parametrize(
    "domain", ["sonari.up.railway.app/", "sonari.up.railway.app"]
)
def test_trailing_slashes_are_trimmed(domain):
    """A trailing slash would produce '…app//exotel/media'."""
    s = Settings(railway_public_domain=domain)
    assert s.effective_base_url == "https://sonari.up.railway.app"


def test_loopback_public_base_url_still_defers_to_the_platform():
    s = Settings(
        public_base_url="http://127.0.0.1:8100",
        railway_public_domain="sonari.up.railway.app",
    )
    assert s.effective_base_url == "https://sonari.up.railway.app"


# ---- Postgres URLs handed out by managed add-ons -------------------------
@pytest.mark.parametrize(
    "raw",
    [
        "postgresql://u:p@monorail.proxy.rlwy.net:1234/railway",  # Railway
        "postgres://u:p@dpg-abc.oregon-postgres.render.com/sonari",  # Render
    ],
)
def test_managed_postgres_urls_get_the_async_driver(raw):
    """SQLAlchemy's async engine needs an explicit +asyncpg driver; hosts hand
    out bare postgres:// URLs."""
    assert Settings(database_url=raw).database_url.startswith("postgresql+asyncpg://")
