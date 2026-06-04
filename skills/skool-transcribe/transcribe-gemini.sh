#!/usr/bin/env bash
# Skool transcribe via Gemini (engine padrão).
# Uso: transcribe-gemini.sh <url-skool> [arquivo-saida.md]
set -euo pipefail

URL="${1:?Uso: transcribe-gemini.sh <url-skool> [out.md]}"
OUT="${2:-transcript-$(date +%Y%m%d-%H%M%S).md}"

ENV_FILE="/home/nmaldaner/projetos/openpcbot/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

: "${SKOOL_COOKIE:?Defina SKOOL_COOKIE no .env}"
: "${GOOGLE_API_KEY:?Defina GOOGLE_API_KEY no .env}"

CLI="${SKOOL_PP_CLI:-$HOME/printing-press/library/skool/skool-pp-cli}"
[ -x "$CLI" ] || { echo "skool-pp-cli não encontrado em $CLI"; exit 1; }

echo "[gemini] transcrevendo $URL -> $OUT"
"$CLI" posts transcribe "$URL" --out "$OUT"
echo "[gemini] OK: $OUT"
