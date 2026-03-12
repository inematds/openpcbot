#!/usr/bin/env bash
# ClaudeClaw — stop background process
DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$DIR/store/claudebot.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm "$PID_FILE"
    echo "Stopped (PID $PID)"
  else
    rm "$PID_FILE"
    echo "Process not running (stale PID file removed)"
  fi
else
  echo "No PID file found. Not running or started differently."
fi
