#!/usr/bin/env bash
# ===================================================================
#  Sonari - stop all servers (macOS / Linux)
# ===================================================================
cd "$(dirname "$0")"

echo
echo "  Stopping Sonari..."

found=0
for port in 8100 5273; do
  pids=$(lsof -Pi :"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    echo "  Stopping process $pid on port $port"
    kill -9 "$pid" 2>/dev/null || true
    found=1
  done
done

rm -f .logs/api.pid .logs/web.pid

if [ "$found" -eq 0 ]; then
  echo "  Nothing was running."
else
  echo
  echo "  Sonari stopped."
fi
echo
