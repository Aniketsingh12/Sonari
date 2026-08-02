"""FastAPI entry point for Sonari."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api import (
    auth,
    bookings,
    businesses,
    calls,
    dashboard,
    demo,
    exotel,
    faqs,
    health,
    media,
    simulator,
)
from app.api.auth import require_admin
from app.config import settings
from app.db import init_db
from app.seed import ensure_seed_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ensure_seed_data()
    yield


app = FastAPI(
    title="Sonari API",
    version=__version__,
    description="AI phone agent for service businesses.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api"

# --- Public surface (no password) -----------------------------------------
# Everything an end user of a shared voice agent touches, plus liveness. The AI
# endpoints in `simulator` are rate-limited instead (see api/ratelimit.py).
app.include_router(health.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)
app.include_router(businesses.public_router, prefix=api_prefix)
app.include_router(simulator.router, prefix=api_prefix)

# --- Owner surface (behind ADMIN_PASSWORD when one is set) -----------------
_admin = [Depends(require_admin)]
app.include_router(businesses.router, prefix=api_prefix, dependencies=_admin)
app.include_router(faqs.router, prefix=api_prefix, dependencies=_admin)
app.include_router(bookings.router, prefix=api_prefix, dependencies=_admin)
app.include_router(dashboard.router, prefix=api_prefix, dependencies=_admin)
app.include_router(demo.router, prefix=api_prefix, dependencies=_admin)

# --- Telephony webhooks (called by Twilio/Exotel, not by a browser) --------
app.include_router(calls.router)          # Twilio webhooks live at /call/*
app.include_router(media.router)          # Twilio media stream WS at /media/*
app.include_router(exotel.router)         # Exotel voicebot WS at /exotel/*


# --------------------------------------------------------------------------
# Serve the built frontend from this same app (the single-container deploy).
# When FRONTEND_DIST points at a build, "/" and all client-side routes return
# the SPA, /assets/* are served as static files, and the API keeps its paths.
# Without it (dev), Vite serves the UI and "/" is a small JSON banner.
# --------------------------------------------------------------------------
_dist = os.path.abspath(settings.frontend_dist) if settings.frontend_dist else ""
_serving_spa = bool(_dist) and os.path.isfile(os.path.join(_dist, "index.html"))

if _serving_spa:
    _assets = os.path.join(_dist, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str) -> FileResponse:
        # API/webhook/websocket paths are owned by the routers above; anything
        # reaching here with those prefixes is a genuine 404, not the SPA.
        if full_path.startswith(("api/", "call/", "media/", "exotel/")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.join(_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)  # favicon, etc.
        return FileResponse(os.path.join(_dist, "index.html"))  # client route

else:
    @app.get("/")
    async def root() -> dict:
        return {
            "service": "Sonari",
            "version": __version__,
            "docs": "/docs",
            "health": "/api/health",
        }
