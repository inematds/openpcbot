#!/usr/bin/env bash
# Skool transcribe via inemaVOX (Whisper GPU local).
# Uso: transcribe-vox.sh <url-skool> [out.txt] [--model large-v3] [--lang pt] [--asr whisper|parakeet]
set -euo pipefail

URL=""
OUT=""
MODEL="large-v3"
LANG=""
ASR="whisper"

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --lang)  LANG="$2";  shift 2 ;;
    --asr)   ASR="$2";   shift 2 ;;
    -h|--help)
      echo "Uso: $0 <url-skool> [out.txt] [--model large-v3] [--lang pt] [--asr whisper|parakeet]"; exit 0 ;;
    *)
      if [ -z "$URL" ]; then URL="$1"
      elif [ -z "$OUT" ]; then OUT="$1"
      else echo "Arg desconhecido: $1"; exit 1
      fi
      shift ;;
  esac
done

[ -n "$URL" ] || { echo "URL obrigatória"; exit 1; }
OUT="${OUT:-transcript-$(date +%Y%m%d-%H%M%S).txt}"
OUT_ABS="$(readlink -f "$OUT" 2>/dev/null || echo "$OUT")"
OUT_DIR="$(dirname "$OUT_ABS")"
OUT_BASE="$(basename "$OUT_ABS" .txt)"

ENV_FILE="/home/nmaldaner/projetos/openpcbot/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
: "${SKOOL_COOKIE:?Defina SKOOL_COOKIE no .env}"

VOX="${INEMAVOX_URL:-http://localhost:8010}"
CLI="${SKOOL_PP_CLI:-$HOME/printing-press/library/skool/skool-pp-cli}"
[ -x "$CLI" ] || { echo "skool-pp-cli não encontrado em $CLI"; exit 1; }

# 1) Confirma vox up
if ! curl -fsS "$VOX/api/system/status" >/dev/null 2>&1; then
  echo "[vox] API offline em $VOX. Rode: sudo systemctl start inemavox-api"
  exit 2
fi

# 2) Baixa MP4 (quality medium = arquivo menor, transcrição é igual)
TMP_DIR="$(mktemp -d -t skool-vox-XXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
MP4="$TMP_DIR/video.mp4"

echo "[vox] baixando MP4 do Skool..."
"$CLI" posts download "$URL" --quality medium --out "$MP4"
[ -s "$MP4" ] || { echo "Download falhou (arquivo vazio)"; exit 3; }

SIZE_MB=$(( $(stat -c %s "$MP4") / 1024 / 1024 ))
echo "[vox] MP4 baixado: ${SIZE_MB} MB"

# 3) Monta config + upload
CONFIG_JSON=$(printf '{"asr_engine":"%s","whisper_model":"%s"%s}' \
  "$ASR" "$MODEL" \
  "$([ -n "$LANG" ] && printf ',"src_lang":"%s"' "$LANG")")

echo "[vox] criando job de transcrição (asr=$ASR model=$MODEL${LANG:+ lang=$LANG})..."
RESP=$(curl -fsS -X POST "$VOX/api/jobs/transcribe/upload" \
  -F "file=@$MP4" \
  -F "config_json=$CONFIG_JSON")

JOB_ID=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
[ -n "$JOB_ID" ] || { echo "Não conseguiu extrair job id: $RESP"; exit 4; }
echo "[vox] job_id=$JOB_ID"

# 4) Polling
MAX_WAIT=$((60*30))   # 30 min
ELAPSED=0
SLEEP=5
while :; do
  STATUS_JSON=$(curl -fsS "$VOX/api/jobs/$JOB_ID")
  STATUS=$(echo "$STATUS_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))')
  PROG=$(echo  "$STATUS_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("progress",""))')
  printf "\r[vox] status=%s progress=%s  (%ds)        " "$STATUS" "$PROG" "$ELAPSED"
  case "$STATUS" in
    completed) echo; break ;;
    failed|canceled)
      echo
      echo "[vox] job $STATUS. logs:"
      curl -fsS "$VOX/api/jobs/$JOB_ID/logs?last_n=30" || true
      exit 5 ;;
  esac
  sleep "$SLEEP"
  ELAPSED=$((ELAPSED+SLEEP))
  [ "$ELAPSED" -ge "$MAX_WAIT" ] && { echo; echo "[vox] timeout após ${MAX_WAIT}s"; exit 6; }
done

# 5) Baixa formatos
echo "[vox] baixando transcrição..."
curl -fsS "$VOX/api/jobs/$JOB_ID/transcript?format=txt"  -o "$OUT_DIR/$OUT_BASE.txt"
curl -fsS "$VOX/api/jobs/$JOB_ID/transcript?format=srt"  -o "$OUT_DIR/$OUT_BASE.srt" || true
curl -fsS "$VOX/api/jobs/$JOB_ID/transcript?format=json" -o "$OUT_DIR/$OUT_BASE.json" || true

CHARS=$(wc -c < "$OUT_DIR/$OUT_BASE.txt")
echo "[vox] OK: $OUT_DIR/$OUT_BASE.txt (${CHARS} chars)"
echo "[vox] também: $OUT_BASE.srt, $OUT_BASE.json"
