---
name: skool-transcribe
description: Processa posts do Skool — transcreve (Gemini ou inemaVOX local) e dubla via inemaVOX. Use quando o usuário colar URL `skool.com/<community>/<slug>?p=<id>`, ou pedir "transcreve/dubla esse post do skool". Acione também para "transcrição local/vox/whisper" ou "dubla pra <lang>" quando o contexto for Skool.
---

# Skool Transcribe

Duas formas de transcrever um vídeo de post do Skool. Escolha pelo que o usuário pediu:

| Engine | Quando usar | Custo | Velocidade |
|--------|-------------|-------|------------|
| `gemini` (default) | Padrão. Rápido e barato. | API Gemini (~free) | ~30s pra vídeo de 20min |
| `vox` | "use o vox", "local", "sem cloud", "whisper" | Zero (GPU local) | ~1-3min pra 20min (depende do modelo) |

## Pré-requisitos comuns

- `ffmpeg` instalado
- `SKOOL_COOKIE` no `.env` do projeto openpcbot (cookie do Skool, expira ~1 ano)
- `~/printing-press/library/skool/skool-pp-cli` instalado

**Engine `gemini`** precisa adicionalmente: `GOOGLE_API_KEY` no `.env`.
**Engine `vox`** precisa adicionalmente: serviço `inemavox-api` rodando em `http://localhost:8010` (`systemctl status inemavox-api`).

## Carregar env

```bash
set -a; . /home/nmaldaner/projetos/openpcbot/.env; set +a
```

## Step — Engine Gemini (default)

```bash
bash /home/nmaldaner/projetos/openpcbot/skills/skool-transcribe/transcribe-gemini.sh \
  "<url-skool>" \
  [arquivo-saida.md]
```

Saída: markdown com resumo + tópicos + transcrição com timestamps.

## Step — Engine inemaVOX (local Whisper GPU)

```bash
bash /home/nmaldaner/projetos/openpcbot/skills/skool-transcribe/transcribe-vox.sh \
  "<url-skool>" \
  [arquivo-saida.txt] \
  [--model large-v3] \
  [--lang pt]
```

Fluxo: baixa MP4 via `skool-pp-cli posts download` → faz upload pro inemaVOX (`POST /api/jobs/transcribe/upload`) → poll de status → baixa `transcript.txt` (e `.srt` e `.json` ao lado).

**Antes de rodar**: confirme que o serviço está up:
```bash
curl -s http://localhost:8010/api/system/status >/dev/null && echo OK || sudo systemctl start inemavox-api
```

## Step — Dublagem via inemaVOX (Skool MP4 → vox dub)

Reusa o pipeline do pp-cli (`posts dub`): Skool → MP4 → upload pro vox → dubbing → MP4 dublado.

```bash
bash /home/nmaldaner/projetos/openpcbot/skills/skool-transcribe/dub-vox.sh \
  "<url-skool>" \
  [out.mp4] \
  [--tgt pt] \
  [--tts chatterbox] \
  [--quality medium]
```

Pode levar bastante tempo (vídeo de 20min ~10-30min na GPU). Avise no início, use `notify.sh` em checkpoints.

Se a sessão cair antes de terminar, retome com o `job_id` que o vox devolveu:
```bash
bash skills/skool-transcribe/dub-vox.sh resume <job-id> [out.mp4]
```

Para perguntar status sem retomar, use a skill `inemavox`: `bash skills/inemavox/vox.sh status <job-id>`.

## Troubleshooting

| Erro | Causa | Fix |
|------|-------|-----|
| `__NEXT_DATA__ not found` | `SKOOL_COOKIE` expirado | Renovar (ver `pp-cli/docs/transcrever-video-skool.md`) |
| `connection refused :8010` | inemavox API down | `sudo systemctl start inemavox-api` |
| Job vox stuck > 10min | GPU travada / modelo grande | Checar logs: `curl localhost:8010/api/jobs/<id>/logs` |
| `ffmpeg: not found` | ffmpeg ausente | `sudo apt install ffmpeg` |

## Telegram — envio do resultado

Após transcrever, envie o arquivo via marker:
```
[SEND_FILE:/caminho/absoluto/transcript.md|Transcrição: <título>]
```
