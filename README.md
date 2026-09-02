# Sonari — AI Voice Agent Builder

Build voice AI agents you can **talk to** — a tutor, a coding helper, a support
agent, a coach, an interviewer, or a phone receptionist — and share each one as a
live page or embed it on a website. An agent's **instructions are its behaviour**,
so the same engine powers any of them. Answering real **phone calls is an optional
add-on**, not a requirement.

The hard part — a real-time **speech-to-text → reasoning → text-to-speech**
pipeline — is built to be **provider-pluggable**: every AI layer runs on either
a **free open-source model**, a **free API**, or a **paid API**, chosen per-layer
from config. And it ships with built-in **mock providers** so the whole product
runs end-to-end with **zero API keys and zero model downloads**.

```
┌────────────────┐    public link / <iframe>   ┌──────────────────────────────┐
│ Anyone, in the │ ──────────────────────────▶ │        FastAPI backend        │
│    browser     │        (no phone needed)    │                              │
└────────────────┘                             │  ┌────────────────────────┐  │
                                               │  │  Voice loop            │  │
┌────────────────┐   optional: webhook / WS    │  │  STT → Agent → TTS     │  │
│ Twilio · Exotel│ ──────────────────────────▶ │  └───────────┬────────────┘  │
│  (phone calls) │      one thin adapter each  │              │               │
└────────────────┘                             │   ┌──────────▼───────────┐   │
                                               │   │ instructions-driven  │   │
┌────────────────┐      REST + WebSocket       │   │ agent  (+ RAG)       │   │
│ React dashboard│ ◀───────────────────────────│   │   — or —             │   │
│  (owner only)  │                             │   │ receptionist graph:  │   │
└────────────────┘                             │   │ faq/book/msg/escalate│   │
                                               │   └──────────┬───────────┘   │
                                               └──────────────┬──────────────┘
                                                              ▼
                                                     SQLite / Postgres
```

## Two kinds of agent

| | Instruction-driven (default) | Receptionist |
|---|---|---|
| Behaviour | your **instructions** (persona, rules, tone) | fixed graph: FAQ → book → message → escalate |
| Good for | tutor, coding helper, support, coach, interviewer | appointment businesses |
| Extras | knowledge base (RAG) | + services, hours, bookings, escalation |
| Created via | `/new` → pick a template | `/new` → Receptionist → full setup wizard |

---

## The pluggable AI pipeline

Each capability is an interface with four families of implementation. Pick one
per layer in `backend/.env`:

| Layer | `mock` (no setup) | Open-source (self-host) | Free API (key, no cost) | Paid API |
|-------|-------------------|-------------------------|-------------------------|----------|
| **STT** | browser speech recognition | `faster_whisper` | `groq` (Whisper) | `openai` · `together` (Whisper) |
| **TTS** | browser system voices | `piper` | — | `together` (Kokoro) · `fish` (cheap, WAV) · `elevenlabs` |
| **LLM** | rule-based keywords | `ollama` | `gemini` | `together` (open models, hosted) · `anthropic` · `openai` |
| **Embeddings** | `hash` trick | `ollama` · `sentence_transformers` | `gemini` | `openai` |

**One Together AI key covers the whole voice loop.** [Together](https://api.together.ai)
hosts an OpenAI-compatible LLM endpoint, a Whisper-compatible transcription
endpoint, and a TTS endpoint (Kokoro) behind a single account — set
`STT_PROVIDER=together`, `TTS_PROVIDER=together`, `LLM_PROVIDER=together` and
one `TOGETHER_API_KEY` drives listening, reasoning and speaking, with no local
models and no juggling separate provider keys.

**Free real AI (no cost, no local models).** Get a free key from
[Google AI Studio](https://aistudio.google.com/apikey) and
[Groq](https://console.groq.com), then:

```env
LLM_PROVIDER=gemini        GEMINI_API_KEY=...
EMBEDDING_PROVIDER=gemini
STT_PROVIDER=groq          GROQ_API_KEY=...
```

That's genuine conversational AI + real Whisper transcription for $0 — ideal for
a cloud deploy where there's no Ollama. (Voice output stays on the browser's
free voices, or Piper — see below.)

**About the mock tier — read this.** It exists so the app runs with zero setup,
but be clear about what it is:

* **TTS `mock` still gives you a real voice in the dashboard.** The frontend
  detects there's no TTS engine and speaks through your browser's built-in
  system voices, so you hear actual speech. It cannot do this over a real phone
  call — set `TTS_PROVIDER=piper` (free, local) or `fish` (paid, cheap) before
  going live. `elevenlabs` returns MP3, so it only covers the browser path.
* **LLM `mock` is not AI.** It's keyword matching that returns canned replies.
  For real conversation set `LLM_PROVIDER=ollama` (free, local) or point it at
  Claude/GPT.

Voice input in the browser uses your browser's own recognition by default; when
a server STT is configured (`groq`/`openai`/`faster_whisper`) the mic records and
sends audio to **Whisper** via `/api/transcribe` instead.

Mix freely — e.g. Groq Whisper for STT, Gemini for reasoning, Piper for voice.
The agent, dashboard, and API are identical regardless of what's behind each
layer. The dashboard's **Pipeline** strip and **Settings → AI pipeline** show
exactly which engine and mode (open-source / free API / paid / mock) is active.

---

## Quick start — one click

Runs on the mock providers: no API keys, no model downloads, nothing to
configure.

| OS | Do this |
|----|---------|
| **Windows** | Double-click **`start.bat`** |
| **macOS / Linux** | `chmod +x start.sh && ./start.sh` |

It creates the Python environment, installs both sets of dependencies, starts
the API and web app, waits until they're actually answering, and opens your
browser at **http://localhost:5273**. First run takes a minute or two; after
that it's a few seconds.

To stop: **`stop.bat`** (Windows) / `./stop.sh` (macOS/Linux), or just close the
two server windows.

### First run

You land on the **home page**, where you can press *Answer the call* and
actually hear the agent handle a caller — the voice is synthesized live by
whichever TTS engine you've configured, so you hear the real thing before
setting anything up. You can also tap through the voices and see which
open-source or paid engine is driving each layer right now.

From there, **Set up my agent** opens the template gallery (`/new`): pick
**Assistant, Tutor, Coding helper, Support, Coach, Interview practice,
Receptionist,** or start from scratch, then write its instructions, greeting,
language and voice. Instructions **are** the agent's behaviour — a tutor tutors,
a support agent supports, because you told it to, not because of hardcoded
logic.

Picking **Receptionist** is different: it has no instructions to write, because
it runs the structured booking graph instead of the general brain, so it opens
the full five-step wizard — business info and hours, what people can book, the
questions callers always ask, booking/escalation rules, and a voice.

Sonari ships **empty**, and neither path assumes a vertical: a salon, a
tutoring business, a law firm and a support team all configure the same way,
each agent answering from *its own* instructions and knowledge base.

### Languages

The agent isn't English-only. Each business picks the language its callers hear
(**English, Spanish, French, German, Hindi, Portuguese**) in the wizard or in
Settings. It's set per-business and applies to the whole call:

* **Reasoning** — the model replies in that language (it understands and speaks
  many; the prompts pin the output language). Works best with a real LLM
  (`LLM_PROVIDER=ollama`/`anthropic`/`openai`) — the zero-setup `mock` classifier
  is English-only.
* **Fixed replies** — booking confirmations, message/escalation lines, closings
  and dates are hand-translated per language with locale-aware date phrasing
  (e.g. *"le he agendado corte de pelo para el martes 28 de julio a las 10:00"*).
* **Voice & speech** — the in-browser demo speaks and listens in the business
  language using your device's voices; real phone calls pass the language to
  Twilio. (Voice *quality* in a given language depends on the TTS voices
  installed on the device or your TTS provider.)

The dashboard interface itself stays in English.

In a hurry? **"Explore with sample data"** fills in a complete sample business
(a dental clinic) with FAQs, calls, and bookings, so you get a populated
dashboard instantly for a demo. While you're in it, a banner across the top
offers **"Exit sample data"** on every page — one click erases it and drops you
back on the home page. (**Settings → Start over** does the same thing.)

Then go to **Voice agent** and talk to it right in the browser — the same
pipeline a real caller or a shared link hits.

| Route | |
|---|---|
| `/` | No agents yet → the landing page. One or more agents → **your agents home** (open, share, create, delete) |
| `/new` | Create an agent from a template |
| `/dashboard` | The **active** agent's workspace — stats, conversations, knowledge, settings |
| `/agent/:id` | **Public, no login** — the shareable/embeddable voice agent |
| `/setup` | The full receptionist wizard (services, hours, FAQs) |
| `/welcome` | The landing page, always reachable (handy for demo videos) |

Opening an agent from the agents home makes it the *active* one (carried in an
`X-Business-Id` header) and takes you to `/dashboard`. The nav pill's agent
chip always links back to `/` to switch. **Bookings** and the booking-only
call filters only appear in the nav for the receptionist — an
instruction-driven agent's dashboard shows conversations instead.

### Sharing an agent

**Settings → Share your voice agent** gives you a public link and an `<iframe>`
snippet. Anyone with the link can talk to that agent; nobody can reach your
dashboard through it.

### Protecting the dashboard

The dashboard is **open by default** so a fresh clone just runs. Set a password
before exposing it to the internet — otherwise anyone who finds the URL can read,
edit and delete every agent:

```env
ADMIN_PASSWORD=something-long-and-random
```

Public voice agents, telephony webhooks and `/api/health` stay reachable without
it. Two independent guards keep a shared link from burning your quota: a
per-IP **rate limit** (caps how *fast* one visitor can call the AI endpoints)
and a global **daily spend budget** (caps how *much* everyone combined can use
per UTC day — `PUBLIC_DAILY_TURN_LIMIT` / `PUBLIC_DAILY_MEDIA_LIMIT` in
`.env`, 0 = unlimited). The budget is what actually tracks a bill: a per-IP
limit alone is defeated by enough visitors, or a spoofed IP. Once exhausted it
fails closed with `429 Too Many Requests` and a `Retry-After` header, and a
signed-in owner (when `ADMIN_PASSWORD` is set) is always exempt. Current usage
against both limits is visible on `GET /api/health`.

**Prerequisites:** Python 3.11+ and Node 18+ on your PATH. The launcher checks
for both and tells you what's missing.

### Or with Docker

One self-contained image — FastAPI serves the built React app and the API
together, on one port:

```bash
docker build -t sonari .
docker run -p 8000:8000 sonari     # open http://localhost:8000
```

The `docker-compose.yml` (backend + Redis + Celery worker + nginx frontend) is
still there if you want the split, multi-service layout for local development.

### Or manually (two terminals)

```bash
# backend
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate      macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100   # → http://localhost:8100 (docs at /docs)
```
```bash
# frontend
cd frontend
npm install
npm run dev                            # → http://localhost:5273
```

> The launcher deliberately runs uvicorn **without** `--reload`: the reloader
> respawns itself through a different interpreter, which breaks inside the
> venv on Windows. Use the manual command above when you want hot-reload.

---

## Deploying

The whole thing is **one container** — FastAPI serves the built React app and
the API from a single process, so there's no separate frontend host and no CORS
to configure. It deploys on the mock providers with no keys, and you flip on
real AI later with one env var.

- **Render** — the repo has a [`render.yaml`](render.yaml); *New → Blueprint →
  select the repo → Apply*.
- **Railway / Fly / any Docker host** — build and run the [`Dockerfile`](Dockerfile).

Full instructions, env vars, real-AI setup, and Postgres persistence are in
**[DEPLOY.md](DEPLOY.md)**.

---

## Switching on real models

Edit `backend/.env` (copy from `.env.example`). Examples:

**Real AI for free, in about a minute (recommended)**

If you have [Ollama](https://ollama.com), this gets you a genuinely
conversational agent and real semantic search at no cost:

```bash
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```
```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1:8b          # must be a model you've pulled
EMBEDDING_PROVIDER=ollama
OLLAMA_EMBED_MODEL=nomic-embed-text
```

Expect roughly 2–3s per turn for an 8B model on CPU (the first call is slower
while the model loads). Use a smaller model like `llama3.2:3b` if you want to
get closer to the 1.5s budget.

**Fully open-source, including voice over the phone**
```env
STT_PROVIDER=faster_whisper
TTS_PROVIDER=piper
LLM_PROVIDER=ollama
EMBEDDING_PROVIDER=ollama
```
```bash
pip install faster-whisper piper-tts
# download a Piper voice into backend/piper_voices/
```

**Paid APIs (best quality / lowest latency)**
```env
STT_PROVIDER=openai
TTS_PROVIDER=elevenlabs
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
```
```bash
pip install anthropic openai elevenlabs
```

No code changes — the factories in `app/providers/` resolve your selection.

---

## Connecting a real phone (optional)

Phone calls are an add-on — the browser agent works without any of this.

1. Expose the backend publicly (e.g. `ngrok http 8100`) and set
   `PUBLIC_BASE_URL` to that URL.
2. In the Twilio console, point your number's **A Call Comes In** webhook to
   `POST {PUBLIC_BASE_URL}/call/incoming` and the status callback to
   `/call/status`.
3. Set `TWILIO_*` in `.env`, and the agent's number under
   **Settings → Phone calls**.

**Exotel (India)** streams audio instead of sending text, so it uses the
WebSocket adapter: add a **Voicebot applet** pointing at
`wss://YOUR_HOST/exotel/media`, and configure real STT/TTS (Exotel supplies
neither) — e.g. `STT_PROVIDER=groq` and `TTS_PROVIDER=piper`.

Adding another provider means one small adapter in `app/telephony/`; the agent
itself never changes.

Two telephony paths are implemented:
- **`<Gather input="speech">`** (default) — uses Twilio's built-in speech
  recognition; the simplest reliable path.
- **Media Streams WebSocket** (`/media/twilio`) — the low-latency streaming
  pipeline through your own STT/TTS providers. Flip `USE_MEDIA_STREAM` in
  `app/api/calls.py`.

---

## Project structure

```
sonari/
├── Dockerfile          single-container image (serves SPA + API)
├── render.yaml         Render one-click blueprint
├── DEPLOY.md           deployment guide
├── start.bat / start.sh    one-click launcher (setup + run + open browser)
├── stop.bat  / stop.sh     stop both servers
├── backend/            FastAPI · agent · providers · RAG · MCP tools · workers
│   ├── app/
│   │   ├── providers/  pluggable STT / TTS / LLM / embeddings (mock+OSS+free+paid)
│   │   ├── agent/      general.py (instruction-driven brain) + the receptionist
│   │   │               graph.py/nodes/prompts/state for the structured brain
│   │   ├── telephony/  provider-agnostic streaming core + Twilio/Exotel adapters
│   │   ├── voice/      VAD + audio helpers for the streaming path
│   │   ├── rag/        FAQ/knowledge ingest + cosine retrieval
│   │   ├── mcp_tools/  calendar + notification tool servers
│   │   ├── api/        REST routers, auth, rate limiting, Twilio/Exotel webhooks
│   │   ├── services/   call orchestration + post-call finalizer
│   │   └── workers/    Celery app + post-call job
│   └── tests/          agent brain, providers, telephony, onboarding, i18n, rate limits
├── frontend/           React + TS + Tailwind dashboard (fully responsive)
│   └── src/
│       ├── pages/      Landing, Agents (home), CreateAgent (templates),
│       │               Onboarding (receptionist wizard), Login, Dashboard,
│       │               Calls, CallDetail, Bookings, Knowledge, Analytics,
│       │               Settings, Simulator, PublicAgent (shareable/embeddable)
│       └── components/ TranscriptViewer, BookingCalendar, VoicePicker, charts…
├── docker-compose.yml
└── README.md
```

---

## Key API endpoints

**Owner-only** (behind `ADMIN_PASSWORD` when one is set):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/businesses` | List every agent you've built |
| `GET/PATCH` | `/api/businesses/me` | The *active* agent (404 = no agents yet) |
| `POST` | `/api/businesses` | Create an agent (template gallery or wizard) |
| `DELETE` | `/api/businesses/{id}` | Delete an agent and cascade its data |
| `POST` | `/api/demo/seed` · `/api/demo/reset` | Load / erase the sample business |
| `GET/POST/PATCH/DELETE` | `/api/faqs` | Knowledge base (re-embeds on write) |
| `GET` | `/api/bookings` | Receptionist-made appointments |
| `GET` | `/api/dashboard/stats` · `/calls` · `/analytics` | Dashboard data |

**Public** (no password — this is what a shared agent link uses; per-IP rate limited and capped by the daily spend budget):

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Status + active providers |
| `GET` | `/api/businesses/{id}/agent` | Safe public config for the embeddable agent |
| `POST` | `/api/simulate/turn` | One conversation turn → reply |
| `GET` | `/api/tts?text=…` | Synthesize audio via the active TTS provider |
| `POST` | `/api/transcribe` | Transcribe a recorded clip via the active STT provider |
| `GET/POST` | `/api/auth/status` · `/login` | Dashboard session (no-ops if no password is set) |

**Telephony webhooks** (called by the provider, not a browser):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/call/incoming` · `/call/gather` · `/call/status` | Twilio webhooks |
| `WS` | `/media/twilio` | Twilio Media Streams pipeline |
| `WS` | `/exotel/media` | Exotel Voicebot/AgentStream pipeline |

Full interactive docs at `/docs`.

---

## Testing

```bash
cd backend
pip install pytest
pytest -q            # end-to-end pipeline tests on the mock providers
python smoke_test.py # quick manual walkthrough of a call
```

---

## Tech stack

FastAPI · WebSockets · SQLAlchemy (async) · SQLite/Postgres(pgvector) · Celery ·
Redis · Twilio Voice · Exotel AgentStream · faster-whisper / Piper / Ollama
(open-source) · Groq / Gemini (free API) · Together AI / OpenAI / ElevenLabs /
Fish Audio / Anthropic (paid) · React · TypeScript · Tailwind · Vite.

## Scope (built)

**Agent builder** — a template gallery (Assistant, Tutor, Coding helper,
Support, Coach, Interview practice, Receptionist, or from scratch); each agent's
instructions drive a general conversational brain, with a knowledge base (RAG)
it can draw on. Manage every agent from one home, switch between them, delete
one and its data cascades cleanly.

**Receptionist** — the one template that opts out of the general brain for a
structured graph instead: FAQ / book / message / escalate, with services,
hours, booking rules, and an owner number read out on escalation.

**Sharing** — every agent gets a public, no-login page and an `<iframe>` embed
snippet, so it's usable with zero telephony setup.

**Telephony (optional)** — Twilio (webhook or Media Streams) and Exotel
(AgentStream WebSocket) via a shared adapter interface; a new provider is one
small file, never a change to the agent.

**Ops** — password-gated dashboard (`ADMIN_PASSWORD`, off by default), per-IP
rate limiting plus a global daily spend budget on the public AI endpoints
(owner-exempt, fails closed with `429`), transcripts/analytics per agent, and
a browser simulator for testing any agent without a phone number.
