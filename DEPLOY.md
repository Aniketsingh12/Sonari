# Deploying Sonari

Sonari ships as **one container**: FastAPI serves both the built React app
and the API from a single process, on a single port. No separate frontend host,
no CORS, no reverse proxy. Deploy the image anywhere that runs Docker.

Out of the box it runs on the **mock providers** — the deployed site works with
no API keys and no cost. Flip on real AI later by setting one env var.

> ### ⚠️ Set a dashboard password before you go public
> The owner dashboard ships **open** so a fresh clone runs with zero setup. On a
> public URL that means anyone can read, edit and **delete every agent**. Set
> `ADMIN_PASSWORD` (as a secret) on your host — it takes effect immediately, and
> shared voice-agent links keep working without it.

---

## Option 1 — Render (near one-click)

The repo includes [`render.yaml`](render.yaml).

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo, **Apply**.
3. Render builds the Dockerfile and deploys. When it's live, open the service
   URL — you'll land on the home page.

Health checks hit `/api/health`. The free plan sleeps on inactivity and
cold-starts on the next request (the first hit after a nap is slow).

## Option 2 — Railway

Railway auto-detects the `Dockerfile`.

1. **New Project → Deploy from GitHub repo.**
2. Railway builds and runs it, injecting `PORT` (the image honours it).
3. Add env vars as needed (see below), then generate a domain.

## Option 3 — Any Docker host / VPS / Fly.io

```bash
docker build -t sonari .
docker run -p 8000:8000 sonari
# open http://localhost:8000
```

That runs the mock providers (no keys needed). To turn on real AI, pass the env
directly — **don't** reuse `backend/.env`, which points the LLM at a local
Ollama that isn't reachable inside the container:

```bash
docker run -p 8000:8000 \
  -e LLM_PROVIDER=anthropic -e ANTHROPIC_API_KEY=sk-ant-... \
  sonari
```

The image reads `$PORT` if set, else 8000. On Fly, `fly launch` detects the
Dockerfile; set the internal port to match.

---

## Environment variables

Everything has a working default. The ones you might set in production:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8000` | Set by most hosts automatically |
| `ADMIN_PASSWORD` | _(empty — dashboard open)_ | **Set this on any public deploy.** Password for the owner dashboard |
| `ENVIRONMENT` | `production` (in image) | — |
| `FRONTEND_DIST` | `/app/static` (in image) | Where the built SPA lives; leave as-is |
| `DATABASE_URL` | SQLite file | Set to a Postgres URL for persistence (see below) |
| `LLM_PROVIDER` | `mock` | `anthropic` / `openai` for real AI |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | Needed only for the matching paid provider |
| `TTS_PROVIDER` | `mock` | `elevenlabs` for phone-call voice (browser demo already speaks) |
| `ELEVENLABS_API_KEY` | — | Needed for ElevenLabs |
| `SEED_DEMO_DATA` | `false` | `true` to auto-load the sample business on boot |
| `PUBLIC_BASE_URL` | localhost | Set to your live URL for Twilio media-stream callbacks |

### Real AI in the cloud — for free

There's no Ollama in the cloud, but you don't need it. **Gemini** (LLM +
embeddings) and **Groq** (Whisper STT) both have free tiers. Grab keys from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) and
[console.groq.com](https://console.groq.com), then set as **secret** env vars:

```env
LLM_PROVIDER=gemini          GEMINI_API_KEY=...
EMBEDDING_PROVIDER=gemini
STT_PROVIDER=groq            GROQ_API_KEY=...
```

That's real conversation, real semantic search, and real Whisper transcription
at no cost. Prefer paid models? `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`
(or `openai`). No code redeploy — just restart with the new env.

### Voice in the cloud

- **Browser voices (free, default).** The in-app "Try a call" speaks and listens
  using the visitor's own device voices — nothing to configure. Good enough for
  a portfolio demo.
- **Open-source voice for real phone calls: Piper.** It runs *inside* the
  container on CPU (no external service). Bake it into the image and switch to it:

  ```bash
  docker build --build-arg INSTALL_PIPER=true -t sonari .
  # then run with:  -e TTS_PROVIDER=piper
  ```

  (On Render, add `INSTALL_PIPER=true` as a Docker build arg / or set it in the
  Dockerfile.) This adds ~60MB for the voice model.
- **Best quality: ElevenLabs (paid).** `TTS_PROVIDER=elevenlabs` +
  `ELEVENLABS_API_KEY`.

Note: browser voices can't play down a phone line — real Twilio calls need Piper
or ElevenLabs.

---

## Data persistence

The default SQLite database lives on the container's disk, which is **ephemeral**
on most hosts — it resets on every deploy and restart. That's fine for a demo
(each cold start returns a clean home page).

For durable data, point `DATABASE_URL` at a managed Postgres:

```env
DATABASE_URL=postgresql://user:pass@host:5432/sonari
```

`postgres://` / `postgresql://` URLs are normalized to the async driver
automatically, and `asyncpg` is already in the image — nothing else to install.
On Render, uncomment the `databases:` block and the `DATABASE_URL` wiring in
`render.yaml` and redeploy.

---

## What's in the single container

- FastAPI (API + WebSockets + Twilio webhooks) serving the built React SPA.
- Post-call work (transcript summary, owner notification) runs **inline** after
  each call, so no separate worker is required.
- Redis + Celery from `docker-compose.yml` are only needed if you want those
  jobs off the request path at higher volume — not for this deploy.

## Real phone calls (optional)

The browser "Try a call" works on the deployed site with no telephony setup. For
real inbound calls, point a Twilio number's voice webhook at
`https://YOUR_URL/call/incoming` and set `PUBLIC_BASE_URL` — see the main
[README](README.md#connecting-a-real-phone-twilio).
