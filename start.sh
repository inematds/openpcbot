#!/usr/bin/env bash
# ClaudeClaw — manual start script
# Usage: ./start.sh         (foreground)
#        ./start.sh bg      (background with log file)

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Ensure Ollama is running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "Starting Ollama..."
  ollama serve &
  sleep 2
fi

# Build if dist is missing or src is newer
if [ ! -d dist ] || [ "$(find src -newer dist/index.js -name '*.ts' 2>/dev/null | head -1)" ]; then
  echo "Building..."
  npm run build
fi

if [ "$1" = "bg" ]; then
  LOG="$DIR/store/claudebot.log"
  mkdir -p "$DIR/store"
  echo "Starting in background — logs: $LOG"
  nohup node dist/index.js >> "$LOG" 2>&1 &
  echo $! > "$DIR/store/claudebot.pid"
  echo "PID: $(cat "$DIR/store/claudebot.pid")"
else
  echo "Starting ClaudeClaw..."
  node dist/index.js
fi
