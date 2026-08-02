# ============================================================================
#  Sonari — single-container image.
#  Stage 1 builds the React app; stage 2 runs FastAPI, which serves both that
#  built app AND the API from one process. Deploy this one image anywhere that
#  runs Docker (Render, Railway, Fly, a VPS). It reads $PORT if the host sets one.
# ============================================================================

# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS frontend
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # -> /web/dist

# ---- Stage 2: backend runtime that also serves the built frontend ----
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production \
    FRONTEND_DIST=/app/static

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# ---- Optional: open-source voice (Piper) baked into the image ----
# Off by default (browser voices cover the demo). Turn on for real phone-call
# audio without a paid TTS:  docker build --build-arg INSTALL_PIPER=true .
# Then run with TTS_PROVIDER=piper.
ARG INSTALL_PIPER=false
ARG PIPER_VOICE=en_US-amy-medium
ENV PIPER_DATA_DIR=/app/piper_voices
RUN if [ "$INSTALL_PIPER" = "true" ]; then \
      pip install piper-tts && \
      mkdir -p "$PIPER_DATA_DIR" && \
      python - "$PIPER_VOICE" <<'PY' ; \
import sys, urllib.request, os
voice = sys.argv[1]                                    # e.g. en_US-amy-medium
lang, region = voice.split("-")[0].split("_")          # en, US
quality = voice.rsplit("-", 1)[1]                       # medium
base = ("https://huggingface.co/rhasspy/piper-voices/resolve/main/"
        f"{lang}/{lang}_{region}/{voice.split('-')[1]}/{quality}/{voice}")
out = os.environ["PIPER_DATA_DIR"]
for ext in (".onnx", ".onnx.json"):
    urllib.request.urlretrieve(base + ext + "?download=true", f"{out}/{voice}{ext}")
    print("downloaded", voice + ext)
PY
    fi

COPY backend/ .
# The built SPA is served from FRONTEND_DIST by app/main.py.
COPY --from=frontend /web/dist /app/static

EXPOSE 8000

# Liveness for hosts that honour Docker healthchecks (Render uses its own).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,os,sys; \
    sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/api/health').status==200 else sys.exit(1)"

# Shell form so ${PORT} (injected by Render/Railway) expands; exec keeps uvicorn
# as PID 1 so it receives shutdown signals.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
