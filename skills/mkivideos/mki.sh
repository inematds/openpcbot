#!/usr/bin/env bash
# mkivideos client — openpcbot fala com o serviço autônomo mkivideos (fila de vídeos).
# O bot NÃO roda mais o motor in-process; só submete e consulta via este wrapper (transporte v1 = CLI).
# Subcomandos:
#   ping
#   add <explicativo|curso|demo> <assunto/link> [--vertical] [--enviar] [--silencioso] [--pasta <dir|.mp4>] [--curso <nome>] [--modulo <label>]
#   fila
#   stats
#   status <id>
#   get <id>            -> só o caminho do .mp4 (vazio se não pronto)
#   cancelar <id>
set -euo pipefail

ENV_FILE="/home/nmaldaner/projetos/openpcbot/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

MKI_DIR="${MKIVIDEOS_DIR:-/home/nmaldaner/projetos/mkivideos}"
export MKIVIDEOS_DB="${MKIVIDEOS_DB:-$MKI_DIR/mkivideos.db}"
DASH="${MKIVIDEOS_DASH:-http://localhost:3142}"
TOKEN="${MKIVIDEOS_TOKEN:-inemadash}"
CLI=(node "$MKI_DIR/dist/cli.js")

cmd="${1:-help}"; shift || true

case "$cmd" in
  ping)
    if curl -fsS --max-time 5 "$DASH/api/stats?token=$TOKEN" >/dev/null 2>&1; then
      echo "[mki] daemon OK $DASH"
    else
      echo "[mki] daemon DOWN $DASH (a fila ainda aceita add/consulta via CLI, mas não processa sem o daemon)"; exit 1
    fi ;;
  add|plan|fila|stats|status|get|cancelar|cancel|help)
    exec "${CLI[@]}" "$cmd" "$@" ;;
  ""|-h|--help)
    sed -n '2,13p' "$0" ;;
  *)
    echo "comando desconhecido: $cmd (use ping|add|fila|stats|status|get|cancelar)"; exit 1 ;;
esac
