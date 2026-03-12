#!/usr/bin/env bash
cat <<'EOF'
=== openPCbot ===

Servico (systemd):
  systemctl --user status openpcbot       # ver status
  systemctl --user restart openpcbot      # reiniciar
  systemctl --user stop openpcbot         # parar
  systemctl --user start openpcbot        # iniciar
  journalctl --user -u openpcbot -f       # ver logs em tempo real

Iniciar manual (sem systemd):
  cd /home/nmaldaner/projetos/openpcbot
  ./start.sh bg

Parar manual:
  ./stop.sh

Rebuildar (apos mudancas no codigo):
  npm run build && systemctl --user restart openpcbot
EOF
