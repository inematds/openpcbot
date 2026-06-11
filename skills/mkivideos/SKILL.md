---
name: mkivideos
description: Fila de vídeos do INEMA (explicativo/curso/demo). O openpcbot é CLIENTE FINO do serviço autônomo mkivideos — submete e consulta via CLI, não roda o motor. Use quando o usuário pedir pra criar vídeo, ver/cancelar a fila, ou status/estatísticas de vídeos.
---

# mkivideos (cliente)

O motor de vídeos roda como **serviço autônomo separado** (`~/projetos/mkivideos`, daemon systemd
+ dashboard em :3142). Este bot só **fala** com ele via `skills/mkivideos/mki.sh` (transporte v1 = CLI,
mesmo host, banco compartilhado `MKIVIDEOS_DB`).

## Uso

```bash
bash skills/mkivideos/mki.sh ping
bash skills/mkivideos/mki.sh add curso https://inematds.github.io/skills-craft --curso skills-craft --modulo t1m1-o-que-e-uma-agent-skill
bash skills/mkivideos/mki.sh fila
bash skills/mkivideos/mki.sh stats         # status + por curso (X/Y) + ETA
bash skills/mkivideos/mki.sh status <id>
bash skills/mkivideos/mki.sh get <id>      # caminho do .mp4 (vazio se não pronto)
bash skills/mkivideos/mki.sh cancelar <id>
```

- O comando `/mkivideos` do Telegram já chama este wrapper por baixo.
- Quem **processa** a fila é o daemon mkivideos (worker background+poll). Sem o daemon ligado, `add`
  e consultas funcionam, mas nada renderiza. Suba com `systemctl --user start mkivideos.service`.
- Painel ao vivo (fila + estatísticas): <http://localhost:3142/videos?token=inemadash>.

## Config (no .env do bot, opcional)

`MKIVIDEOS_DIR` (default `~/projetos/mkivideos`) · `MKIVIDEOS_DB` · `MKIVIDEOS_DASH`
(default `http://localhost:3142`) · `MKIVIDEOS_TOKEN` (default `inemadash`).
