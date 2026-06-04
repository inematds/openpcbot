---
name: inemavox
description: Envia jobs (transcrever, baixar, dublar, cortar) pro inemaVOX local (Whisper/Chatterbox GPU) e consulta o que já foi processado. Use quando o usuário mandar URL de vídeo (YouTube, TikTok, Instagram, Skool, Vimeo), pedir "transcreve/baixa/dubla/corta", perguntar "que jobs rodei", "tem aquela transcrição do X", ou citar inemavox/vox/whisper/parakeet.
---

# inemaVOX bridge

Wrapper único: `bash /home/nmaldaner/projetos/openpcbot/skills/inemavox/vox.sh <subcmd> ...`

API em `http://localhost:8010`. Fila do vox é **serial FIFO** (1 job por vez), então o bot só dispara, recebe `job_id`, e o usuário pode mandar outras URLs — elas enfileiram sozinhas. Sempre devolva o `job_id` pro usuário.

## Quando disparar (auto-detect)

Detecte na mensagem do usuário:

| Sinal | Ação |
|-------|------|
| URL `youtube.com / youtu.be / tiktok / instagram.com / vimeo / facebook` sem mais contexto | `submit transcribe <url>` (default) |
| Pediu "baixa esse vídeo" | `submit download <url>` |
| Pediu "dubla pra <lang>" | `submit dub <url> --tgt <lang>` |
| Pediu "corta os melhores momentos" / "vira clips" | `submit cut <url>` |
| URL `skool.com/...?p=...` | usar skill **skool-transcribe** (Gemini default, ou vox se pedir local) — não esta aqui |
| "que jobs rodei", "lista jobs", "status do último" | `list` ou `status <id>` |
| "tem música de X na biblioteca?" | `library` ou `search "X"` |
| "me dá a transcrição do job <id>" | `get <id> --format txt` |

Se faltar contexto (ex.: URL + nada), default = `transcribe`.

## Pré-flight

```bash
bash skills/inemavox/vox.sh ping
```
Se DOWN, avise o usuário e ofereça: `sudo systemctl start inemavox-api`.

## Subcomandos

### Submeter job
```bash
bash skills/inemavox/vox.sh submit transcribe "<url-ou-path>" [--lang pt] [--model large-v3] [--asr whisper|parakeet]
bash skills/inemavox/vox.sh submit download   "<url>"
bash skills/inemavox/vox.sh submit dub        "<url>" [--tgt pt]
bash skills/inemavox/vox.sh submit cut        "<url-ou-path>"
```
Saída: `[vox] <kind> enfileirado. job_id=XXXX` + dump do job.

### Consultar
```bash
bash skills/inemavox/vox.sh status  <job_id>
bash skills/inemavox/vox.sh logs    <job_id> [N]
bash skills/inemavox/vox.sh list    [--status completed|running|queued|failed] [--type transcription|dubbing|cutting|download] [--limit 20]
```

### Baixar resultado
```bash
bash skills/inemavox/vox.sh get <job_id> --format txt|srt|json   # transcript
bash skills/inemavox/vox.sh get <job_id> --format mp4            # vídeo (dub/download)
bash skills/inemavox/vox.sh get <job_id> --format audio          # áudio (tts/voice clone)
```
Salva em `./out/`. Depois mande pro Telegram via `[SEND_FILE:...]`.

### Biblioteca de áudio
```bash
bash skills/inemavox/vox.sh library music|sfx
bash skills/inemavox/vox.sh search "<query>"
```

## Fluxo típico no bot

1. Usuário manda URL YouTube.
2. `ping` (rápido). Se down, avisar + abortar.
3. `submit transcribe <url>` → captura `job_id`.
4. Responder ao usuário em uma linha: "vox: transcribendo `<title>` (job XXXX). Te aviso quando ficar pronto."
5. Em background (ou no próximo turn quando user perguntar): `status XXXX`. Quando `completed`:
   - `get XXXX --format txt`
   - Enviar via `[SEND_FILE:/caminho/out/XXXX_transcript.txt|Transcrição: <title>]` + resumo de 2-3 linhas.

Para múltiplas URLs em sequência: chame `submit` pra cada uma na ordem recebida. O vox enfileira sozinho — não precisa lógica extra de queue do lado do bot.

## Perguntas sobre o que tem no inemavox

Quando o usuário perguntar coisas tipo "que vídeos transcrevi essa semana?", "tem dub em espanhol?", "qual o status daquele job grande?":
- Comece por `list` (filtra por --status/--type/--limit).
- Para detalhe: `status <id>` (mostra config completa, progresso, título do vídeo).
- Para resumo de conteúdo de uma transcrição: `curl -fsS http://localhost:8010/api/jobs/<id>/transcript-summary` (devolve título + texto resumido).
