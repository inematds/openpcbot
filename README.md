# OpenPCBot

Bot Telegram pessoal rodando Claude Code CLI na maquina local, com sistema multi-agente (Ollama, Codex, OpenRouter) e orquestrador inteligente.

Baseado no [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw). Guia completo do upstream em [CLAUDECLAW_GUIDE.md](./CLAUDECLAW_GUIDE.md).

---

## O que e

OpenPCBot e um assistente pessoal via Telegram que roda o `claude` CLI real na sua maquina. Nao e wrapper de API. Ele spawna o processo Claude Code com todas as suas skills, tools e contexto, e devolve o resultado no Telegram.

Alem do Claude, integra Ollama (local, gratis), OpenRouter (multi-modelo), e Codex (OpenAI) como agentes alternativos, com um orquestrador que classifica e despacha mensagens automaticamente.

---

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Runtime | Node.js 20+ / TypeScript |
| Bot | grammy (Telegram Bot API) |
| Agente principal | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| LLM local | Ollama (qwen3.5:35b-a3b / qwen2.5:14b) |
| Multi-modelo | OpenRouter API |
| Coding agent | Codex CLI (OpenAI) |
| Database | SQLite (WAL mode) com FTS5 |
| Dashboard | Hono + Tailwind + Chart.js (porta 3141) |
| Voice STT | Groq Whisper |
| Voice TTS | ElevenLabs / Gradium / macOS say |
| Servico | systemd user service |

---

## Arquitetura

```
Telegram
  |
  |-- /claude <msg>     -> Claude Agent SDK (tools completas)
  |-- /codex <msg>      -> Codex CLI (full-auto)
  |-- /ollama <msg>     -> Ollama local (gratis)
  |-- /openrouter <msg> -> OpenRouter (multi-modelo)
  |
  +-- (sem prefixo)
       |-- [/orq OFF]   -> Ollama responde direto (default)
       +-- [/orq ON]    -> Orquestrador classifica e despacha
```

O Claude tem acesso completo: bash, file system, web search, MCP servers, skills. Os outros agentes sao mais leves e baratos para tarefas simples.

---

## Funcionalidades

- **Texto, voz, fotos, documentos, videos** via Telegram
- **Sistema multi-agente** com 4 backends (Claude, Ollama, Codex, OpenRouter)
- **Orquestrador** que classifica mensagens e roteia para o agente certo
- **Memoria persistente** com SQLite FTS5, salience decay, e context injection
- **Sessoes persistentes** via Claude Code session resumption
- **Tarefas agendadas** com cron (scheduler interno)
- **Dashboard web** com metricas, memoria, saude, custos, chat em tempo real
- **WhatsApp bridge** via wa-daemon (linked devices, sem API key)
- **Slack integration** com User OAuth Token
- **Envio de arquivos** de volta para o Telegram (PDF, imagens, etc.)
- **Skills auto-loaded** de `~/.claude/skills/`
- **Agentes especialistas** (comms, content, ops, research) com contexto isolado
- **Obsidian auto-injection** de tarefas abertas para agentes
- **Hive mind** para logs cross-agent
- **Project resolver** para navegacao entre projetos locais

---

## Estrutura

```
openpcbot/
├── src/
│   ├── index.ts          Entrypoint
│   ├── bot.ts            Handler Telegram (texto, voz, foto, comandos)
│   ├── agent.ts          Integracao Claude Agent SDK
│   ├── ollama.ts         Cliente Ollama (chat, health, models)
│   ├── openrouter.ts     Cliente OpenRouter API
│   ├── codex.ts          Runner Codex CLI
│   ├── router.ts         Orquestrador (classifica + despacha)
│   ├── db.ts             SQLite (schema, queries, migrations)
│   ├── memory.ts         Memoria (save, search, decay)
│   ├── scheduler.ts      Cron task runner
│   ├── voice.ts          STT (Groq) + TTS (ElevenLabs/Gradium)
│   ├── media.ts          Download de midia do Telegram
│   ├── dashboard.ts      Servidor web dashboard
│   ├── dashboard-html.ts UI do dashboard
│   ├── slack.ts          Cliente Slack API
│   ├── whatsapp.ts       Cliente WhatsApp
│   ├── project-resolver.ts  Resolucao de projetos locais
│   ├── config.ts         Leitor de .env
│   └── logger.ts         Logger estruturado
├── agents/               Agentes especialistas
│   ├── comms/            Email, Slack, WhatsApp
│   ├── content/          YouTube, LinkedIn, conteudo
│   ├── ops/              Calendario, billing, admin
│   ├── research/         Pesquisa profunda
│   └── _template/        Template para novos agentes
├── skills/               Skills bundled (gmail, calendar, slack)
├── scripts/              Setup, status, wa-daemon, agent tools
├── docs/                 Docs de implementacao
├── store/                Runtime (DB, PID, sessoes WhatsApp)
└── workspace/uploads/    Downloads de midia (auto-cleanup 24h)
```

---

## Comandos Telegram

### Agentes

| Comando | Descricao |
|---------|-----------|
| (mensagem normal) | Vai para Ollama (ou orquestrador se /orq ON) |
| `/claude <msg>` | Envia direto para Claude Code |
| `/ollama <msg>` | Envia para Ollama local |
| `/codex <msg>` | Envia para Codex (OpenAI) |
| `/openrouter <msg>` | Envia para OpenRouter |
| `/orq` | Liga/desliga orquestrador automatico |
| `/models` | Lista modelos disponiveis no Ollama |

### Gerais

| Comando | Descricao |
|---------|-----------|
| `/stop` | Cancela query em execucao |
| `/model <nome>` | Troca modelo Claude (haiku/sonnet/opus) |
| `/voice` | Liga/desliga respostas em audio |
| `/newchat` | Nova sessao limpa |
| `/respin` | Recupera ultimas 20 turns numa sessao nova |
| `/memory` | Mostra memorias recentes |
| `/forget` | Limpa sessao (memorias decaem naturalmente) |
| `/wa` | Interface WhatsApp |
| `/slack` | Interface Slack |
| `/dashboard` | Link para o dashboard web |

---

## Deploy

Roda como systemd user service em `~/.config/systemd/user/openpcbot.service`.

```bash
# Status
systemctl --user status openpcbot

# Logs
journalctl --user -u openpcbot -f

# Restart
systemctl --user restart openpcbot

# Build + restart
npm run build && systemctl --user restart openpcbot
```

---

## Configuracao

Variaveis principais em `.env` (ver `.env.example` para lista completa):

| Variavel | Obrigatoria | Descricao |
|----------|-------------|-----------|
| `TELEGRAM_BOT_TOKEN` | Sim | Token do @BotFather |
| `ALLOWED_CHAT_ID` | Sim | Seu chat ID (envia /chatid) |
| `OLLAMA_URL` | Nao | URL do Ollama (default: localhost:11434) |
| `OLLAMA_MODEL` | Nao | Modelo para chat direto |
| `OLLAMA_ROUTER_MODEL` | Nao | Modelo para o orquestrador |
| `OPENROUTER_API_KEY` | Nao | Key do OpenRouter |
| `OPENROUTER_MODEL` | Nao | Modelo do OpenRouter |
| `ANTHROPIC_API_KEY` | Nao | Pay-per-token (alternativa ao Max) |
| `GROQ_API_KEY` | Nao | Voice input (Whisper) |
| `ELEVENLABS_API_KEY` | Nao | Voice output |
| `DASHBOARD_TOKEN` | Nao | Token para acesso ao dashboard |
| `SLACK_USER_TOKEN` | Nao | Token Slack (xoxp-) |

---

## Desenvolvimento

```bash
npm install          # Instalar deps
npm run dev          # Dev mode (tsx, sem build)
npm run build        # Compilar TypeScript
npm start            # Rodar compilado
npm test             # Testes (vitest)
npm run typecheck    # Type-check sem compilar
npm run setup        # Wizard interativo
npm run status       # Health check
```

---

## Upstream

Baseado no ClaudeClaw. Documentacao completa do projeto original (setup detalhado, API keys, WhatsApp, Slack, dashboard, memoria, agentes especialistas, troubleshooting) esta em [CLAUDECLAW_GUIDE.md](./CLAUDECLAW_GUIDE.md).

---

## Licenca

MIT
