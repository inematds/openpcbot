#!/usr/bin/env bash
# inemaVOX wrapper — submit jobs and query state.
# Subcomandos:
#   submit <kind> <input> [--lang pt] [--model large-v3] [--asr whisper|parakeet] [--tgt pt]
#       kind = transcribe | download | dub | cut
#       input = URL (youtube, tiktok, skool, ...) ou caminho de arquivo local
#   status <job_id>
#   logs <job_id> [N]
#   list [--status completed|running|queued|failed] [--type transcription|dubbing|...] [--limit 20]
#   get   <job_id> [--format txt|srt|json|mp4]   -> salva resultado em ./out/
#   library [music|sfx]
#   search <query>     -> busca áudio (Freesound)
#   ping
set -euo pipefail

ENV_FILE="/home/nmaldaner/projetos/openpcbot/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
VOX="${INEMAVOX_URL:-http://localhost:8010}"

ping_vox() {
  curl -fsS --max-time 5 "$VOX/api/system/status" >/dev/null 2>&1
}

require_vox() {
  ping_vox || { echo "[vox] API offline em $VOX. sudo systemctl start inemavox-api"; exit 2; }
}

cmd="${1:-}"; shift || true

case "$cmd" in

  ping)
    if ping_vox; then echo "[vox] OK $VOX"; else echo "[vox] DOWN $VOX"; exit 1; fi
    ;;

  submit)
    require_vox
    KIND="${1:?submit <transcribe|download|dub|cut> <input> [opts]}"; shift
    INPUT="${1:?input (URL ou path) obrigatório}"; shift
    LANG=""; MODEL="large-v3"; ASR="whisper"; TGT="pt"
    while [ $# -gt 0 ]; do
      case "$1" in
        --lang)  LANG="$2";  shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --asr)   ASR="$2";   shift 2 ;;
        --tgt)   TGT="$2";   shift 2 ;;
        *) echo "arg desconhecido: $1"; exit 1 ;;
      esac
    done

    is_url=false
    [[ "$INPUT" =~ ^https?:// ]] && is_url=true

    # mapeia kind -> endpoint + payload
    case "$KIND" in
      transcribe)
        if $is_url; then
          ROUTE="/api/jobs/transcribe"
          PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'input':sys.argv[1],'asr_engine':sys.argv[2],'whisper_model':sys.argv[3], **({'src_lang':sys.argv[4]} if sys.argv[4] else {})}))" "$INPUT" "$ASR" "$MODEL" "$LANG")
          RESP=$(curl -fsS -X POST "$VOX$ROUTE" -H 'content-type: application/json' -d "$PAYLOAD")
        else
          [ -f "$INPUT" ] || { echo "arquivo não existe: $INPUT"; exit 1; }
          CFG=$(python3 -c "import json,sys; print(json.dumps({'asr_engine':sys.argv[1],'whisper_model':sys.argv[2], **({'src_lang':sys.argv[3]} if sys.argv[3] else {})}))" "$ASR" "$MODEL" "$LANG")
          RESP=$(curl -fsS -X POST "$VOX/api/jobs/transcribe/upload" -F "file=@$INPUT" -F "config_json=$CFG")
        fi ;;
      download)
        if $is_url; then
          RESP=$(curl -fsS -X POST "$VOX/api/jobs/download" -H 'content-type: application/json' -d "$(printf '{"url":"%s"}' "$INPUT")")
        else
          echo "download precisa de URL"; exit 1
        fi ;;
      dub)
        if $is_url; then
          PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'input':sys.argv[1],'tgt_lang':sys.argv[2]}))" "$INPUT" "$TGT")
          RESP=$(curl -fsS -X POST "$VOX/api/jobs" -H 'content-type: application/json' -d "$PAYLOAD")
        else
          CFG=$(python3 -c "import json,sys; print(json.dumps({'tgt_lang':sys.argv[1]}))" "$TGT")
          RESP=$(curl -fsS -X POST "$VOX/api/jobs/upload" -F "file=@$INPUT" -F "config_json=$CFG")
        fi ;;
      cut)
        if $is_url; then
          RESP=$(curl -fsS -X POST "$VOX/api/jobs/cut" -H 'content-type: application/json' -d "$(printf '{"input":"%s","mode":"viral"}' "$INPUT")")
        else
          CFG='{"mode":"viral"}'
          RESP=$(curl -fsS -X POST "$VOX/api/jobs/cut/upload" -F "file=@$INPUT" -F "config_json=$CFG")
        fi ;;
      *) echo "kind inválido: $KIND (use transcribe|download|dub|cut)"; exit 1 ;;
    esac

    JID=$(echo "$RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
    echo "[vox] $KIND enfileirado. job_id=$JID"
    echo "$RESP" | python3 -m json.tool | head -20
    ;;

  status)
    require_vox
    JID="${1:?status <job_id>}"
    curl -fsS "$VOX/api/jobs/$JID" | python3 -m json.tool
    ;;

  logs)
    require_vox
    JID="${1:?logs <job_id> [N]}"
    N="${2:-50}"
    curl -fsS "$VOX/api/jobs/$JID/logs?last_n=$N" | python3 -c '
import sys,json; d=json.load(sys.stdin)
for line in d.get("logs",[]): print(line)'
    ;;

  list)
    require_vox
    STATUS=""; TYPE=""; LIMIT=20
    while [ $# -gt 0 ]; do
      case "$1" in
        --status) STATUS="$2"; shift 2 ;;
        --type)   TYPE="$2";   shift 2 ;;
        --limit)  LIMIT="$2";  shift 2 ;;
        *) shift ;;
      esac
    done
    curl -fsS "$VOX/api/jobs" \
      | python3 -c "
import sys,json,os
items=json.load(sys.stdin)
if isinstance(items, dict): items=items.get('jobs',items.get('items',[]))
st=os.environ.get('STATUS',''); tp=os.environ.get('TYPE',''); lim=int(os.environ.get('LIMIT','20'))
def t(j): return j.get('config',{}).get('job_type','?')
def keep(j):
    if st and j.get('status')!=st: return False
    if tp and t(j)!=tp: return False
    return True
items=[j for j in items if keep(j)]
items=sorted(items, key=lambda j: j.get('created_at',0), reverse=True)[:lim]
print(f'{\"job_id\":<10} {\"type\":<14} {\"status\":<10} {\"created\":<20} title')
print('-'*90)
import datetime as dt
for j in items:
    ts=dt.datetime.fromtimestamp(j.get('created_at',0)).strftime('%Y-%m-%d %H:%M:%S') if j.get('created_at') else '?'
    title=(j.get('video_title') or j.get('config',{}).get('input','') or '')[:40]
    print(f\"{j.get('id','?'):<10} {t(j):<14} {j.get('status','?'):<10} {ts:<20} {title}\")
" STATUS="$STATUS" TYPE="$TYPE" LIMIT="$LIMIT"
    ;;

  get)
    require_vox
    JID="${1:?get <job_id> [--format ...]}"; shift
    FMT="txt"
    while [ $# -gt 0 ]; do
      case "$1" in --format) FMT="$2"; shift 2 ;; *) shift ;; esac
    done
    mkdir -p ./out
    case "$FMT" in
      txt|srt|json)
        OUT="./out/${JID}_transcript.${FMT}"
        curl -fsS "$VOX/api/jobs/$JID/transcript?format=$FMT" -o "$OUT"
        echo "[vox] salvo: $OUT" ;;
      mp4)
        OUT="./out/${JID}.mp4"
        curl -fsS "$VOX/api/jobs/$JID/download" -o "$OUT"
        echo "[vox] salvo: $OUT" ;;
      audio)
        OUT="./out/${JID}_audio"
        curl -fsS "$VOX/api/jobs/$JID/audio" -o "$OUT"
        echo "[vox] salvo: $OUT" ;;
      *) echo "format inválido: $FMT"; exit 1 ;;
    esac
    ;;

  library)
    require_vox
    KIND="${1:-music}"
    curl -fsS "$VOX/api/audio/library?kind=$KIND" | python3 -m json.tool | head -80
    ;;

  search)
    require_vox
    Q="${1:?search <query>}"
    BODY=$(python3 -c 'import json,sys; print(json.dumps({"query":sys.argv[1],"kind":"music","per_page":10}))' "$Q")
    curl -fsS -X POST "$VOX/api/audio/search" -H 'content-type: application/json' -d "$BODY" \
      | python3 -m json.tool | head -100
    ;;

  ""|help|-h|--help)
    sed -n '2,18p' "$0"
    ;;

  *) echo "comando desconhecido: $cmd"; exit 1 ;;
esac
