#!/usr/bin/env bash
# Dublagem de post Skool via inemaVOX.
# Reusa skool-pp-cli posts dub (Skool MP4 -> vox dubbing -> MP4 dublado).
# Uso:
#   dub-vox.sh <url-skool> [out.mp4] [--tgt pt] [--tts chatterbox] [--quality medium]
#   dub-vox.sh resume <job-id> [out.mp4]
set -euo pipefail

ENV_FILE="/home/nmaldaner/projetos/openpcbot/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
: "${SKOOL_COOKIE:?Defina SKOOL_COOKIE no .env}"

VOX="${INEMAVOX_URL:-http://localhost:8010}"
CLI="${SKOOL_PP_CLI:-$HOME/printing-press/library/skool/skool-pp-cli}"
[ -x "$CLI" ] || { echo "skool-pp-cli não encontrado em $CLI"; exit 1; }

# pré-flight vox
curl -fsS --max-time 5 "$VOX/api/system/status" >/dev/null \
  || { echo "[dub-vox] inemaVOX offline em $VOX. sudo systemctl start inemavox-api"; exit 2; }

# resume mode
if [ "${1:-}" = "resume" ]; then
  shift
  JID="${1:?resume <job-id> [out.mp4]}"; shift || true
  OUT="${1:-./out/skool-dub-${JID}.mp4}"
  mkdir -p "$(dirname "$OUT")"
  exec "$CLI" posts dub-resume "$JID" --inemavox "$VOX" --out "$OUT"
fi

URL="${1:?Uso: dub-vox.sh <url-skool> [out.mp4] [--tgt pt] [--tts chatterbox] [--quality medium] | dub-vox.sh resume <id>}"
shift
OUT=""; TGT="pt"; TTS=""; QUAL="medium"
while [ $# -gt 0 ]; do
  case "$1" in
    --tgt|--target-lang) TGT="$2"; shift 2 ;;
    --tts|--tts-engine)  TTS="$2"; shift 2 ;;
    --quality)           QUAL="$2"; shift 2 ;;
    *)
      if [ -z "$OUT" ]; then OUT="$1"; shift
      else echo "arg desconhecido: $1"; exit 1
      fi ;;
  esac
done
OUT="${OUT:-./out/skool-dub-$(date +%Y%m%d-%H%M%S)-${TGT}.mp4}"
mkdir -p "$(dirname "$OUT")"

echo "[dub-vox] dublando $URL -> $OUT (tgt=$TGT quality=$QUAL${TTS:+ tts=$TTS})"
ARGS=(posts dub "$URL" --inemavox "$VOX" --target-lang "$TGT" --quality "$QUAL" --out "$OUT")
[ -n "$TTS" ] && ARGS+=(--tts-engine "$TTS")
"$CLI" "${ARGS[@]}"
echo "[dub-vox] OK: $OUT"
