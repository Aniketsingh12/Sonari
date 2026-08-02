#!/usr/bin/env bash
# ===================================================================
#  Sonari - one-click launcher (macOS / Linux)
#  Run:  ./start.sh      (first: chmod +x start.sh)
#  Sets everything up on first run, starts both servers, opens browser.
# ===================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  Sonari - AI Voice Agents"
echo "  =========================="
echo

# ---- Prerequisite checks ------------------------------------------
command -v python3 >/dev/null 2>&1 || {
  echo "  [X] python3 not found. Install Python 3.11+ and re-run."; exit 1;
}
command -v node >/dev/null 2>&1 || {
  echo "  [X] node not found. Install Node 18+ and re-run."; exit 1;
}

# ---- Port check ---------------------------------------------------
if lsof -Pi :8100 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  [!] Port 8100 is already in use - Sonari may already be running."
  echo "      Run ./stop.sh first, or open http://localhost:5273"
  exit 1
fi

# ---- Backend setup ------------------------------------------------
if [ ! -x "backend/.venv/bin/python" ]; then
  echo "  [1/4] Creating Python environment (first run only)..."
  python3 -m venv backend/.venv
else
  echo "  [1/4] Python environment ready."
fi

echo "  [2/4] Installing backend packages..."
backend/.venv/bin/python -m pip install -q --disable-pip-version-check -r backend/requirements.txt

if [ ! -f "backend/.env" ]; then
  cp backend/.env.example backend/.env
  echo "        Created backend/.env (edit it to switch AI providers)."
fi

# ---- Frontend setup -----------------------------------------------
if [ ! -d "frontend/node_modules" ]; then
  echo "  [3/4] Installing frontend packages (first run, may take a minute)..."
  (cd frontend && npm install --silent)
else
  echo "  [3/4] Frontend packages ready."
fi

# ---- Launch -------------------------------------------------------
echo "  [4/4] Starting servers..."
echo

mkdir -p .logs
# No --reload: the reloader respawns via a different interpreter and is a dev
# convenience, not something a one-click launcher needs (see README).
(cd backend && .venv/bin/python -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8100 > ../.logs/backend.log 2>&1) &
API_PID=$!

(cd frontend && npm run dev > ../.logs/frontend.log 2>&1) &
WEB_PID=$!

echo "$API_PID" > .logs/api.pid
echo "$WEB_PID" > .logs/web.pid

cleanup() {
  echo
  echo "  Stopping Sonari..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  rm -f .logs/api.pid .logs/web.pid
  exit 0
}
trap cleanup INT TERM

# ---- Wait for the API ---------------------------------------------
echo "  Waiting for the API to come up..."
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:8100/api/health; then break; fi
  if [ "$i" -eq 60 ]; then
    echo "  [X] API did not start. See .logs/backend.log"; cleanup
  fi
  sleep 1
done
echo "  API is up."

# ---- Wait for the web app -----------------------------------------
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://127.0.0.1:5273/; then break; fi
  sleep 1
done
echo "  Web app is up."
echo

# ---- Open the browser ---------------------------------------------
if command -v open >/dev/null 2>&1; then open http://localhost:5273
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5273
fi

cat <<'EOF'
  ==========================================================
    Sonari is running.

      Dashboard : http://localhost:5273
      API docs  : http://localhost:8100/docs

    Logs in .logs/  ·  Press Ctrl+C to stop.
  ==========================================================
EOF

wait
