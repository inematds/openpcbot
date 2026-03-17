# OpenPCBot

Bot Telegram pessoal rodando Claude Code CLI na maquina local, com sistema multi-agente (Ollama, Codex, OpenRouter), orquestrador inteligente, e segundo cerebro (vault de notas).

Baseado no [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw). Guia completo do upstream em [CLAUDECLAW_GUIDE.md](./CLAUDECLAW_GUIDE.md).

---

## O que e

OpenPCBot e um assistente pessoal via Telegram que roda o `claude` CLI real na sua maquina. Nao e wrapper de API. Ele spawna o processo Claude Code com todas as suas skills, tools e contexto, e devolve o resultado no Telegram.

Alem do Claude, integra Ollama (local, gratis), OpenRouter (multi-modelo), e Codex (OpenAI) como agentes alternativos, com um orquestrador que classifica e despacha mensagens automaticamente.

Inclui um sistema de "segundo cerebro" que armazena notas, documentos e contexto num vault local, permitindo que o bot acumule conhecimento sobre voce e seus projetos ao longo do tempo.

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
| Second Brain | Vault local (.md) + Gemini/Claude/Ollama para processamento |
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
  |-- /brain <conteudo> -> Salva no vault ~/vault/inbox/
  |-- /daily ou /dia    -> Standup matinal com contexto do vault
  |-- /tldr ou /resuma  -> Salva resumo da sessao no vault
  |
  +-- (sem prefixo)
       |-- "guarda isso: ..."  -> Detecta trigger, salva no vault
       |-- [/orq OFF]          -> Ollama responde direto (default)
       +-- [/orq ON]           -> Orquestrador classifica e despacha
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
- **Second Brain** — vault de notas com comandos /brain, /daily, /tldr e triggers naturais

---

## Estrutura

```
openpcbot/
├── src/
│   ├── index.ts          Entrypoint
│   ├── bot.ts            Handler Telegram (texto, voz, foto, comandos, brain)
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
│   ├── config.ts         Leitor de .env (inclui VAULT_PATH)
│   └── logger.ts         Logger estruturado
├── agents/               Agentes especialistas
│   ├── comms/            Email, Slack, WhatsApp
│   ├── content/          YouTube, LinkedIn, conteudo
│   ├── ops/              Calendario, billing, admin
│   ├── research/         Pesquisa profunda
│   └── _template/        Template para novos agentes
├── skills/               Skills bundled
│   ├── gmail/            Email
│   ├── google-calendar/  Calendario
│   ├── slack/            Slack
│   ├── vault-setup/      Configurador interativo do vault
│   ├── daily/            Standup matinal com contexto do vault
│   ├── tldr/             Resumo de sessao salvo no vault
│   └── file-intel/       Processador de docs (Gemini/Claude/Ollama)
├── scripts/
│   ├── process_files_with_gemini.py   Analisa pasta de arquivos
│   ├── process_docs_to_obsidian.py    Converte docs em notas Obsidian
│   ├── setup.ts          Wizard interativo de setup
│   ├── status.ts         Health check
│   ├── notify.sh         Envia mensagem Telegram via curl
│   ├── wa-daemon.ts      WhatsApp daemon
│   ├── agent-create.sh   Wizard de criacao de agentes
│   └── agent-service.sh  Instala agentes como servico systemd
├── vault-template/       Template de vault (inbox, daily, projects, research, archive)
├── docs/                 Docs de implementacao
├── store/                Runtime (DB, PID, sessoes WhatsApp)
├── workspace/uploads/    Downloads de midia (auto-cleanup 24h)
└── outputs/              Saida do processamento de docs (gitignored)
```

---

## Comandos Telegram

### Agentes

| Comando | Descricao |
|---------|-----------|
| (mensagem normal) | Vai para Ollama (ou orquestrador se /orq ON) |
| `/claude <msg>` | Envia direto para Claude Code (acesso completo a tools) |
| `/ollama <msg>` | Envia para Ollama local |
| `/codex <msg>` | Envia para Codex (OpenAI) |
| `/openrouter <msg>` | Envia para OpenRouter |
| `/orq` | Liga/desliga orquestrador automatico |
| `/models` | Lista modelos disponiveis no Ollama |

### Second Brain

| Comando | Descricao |
|---------|-----------|
| `/brain <texto>` | Salva texto como nota no vault (`~/vault/inbox/`) |
| `/brain` (com arquivo) | Envia documento com legenda `/brain` para salvar no vault |
| `/daily` | Standup matinal: le nota do dia, checa inbox, lista prioridades |
| `/dia` | Alias de `/daily` (mesmo comportamento) |
| `/tldr` | Salva resumo da sessao no vault (decisoes, contexto, proximos passos) |
| `/resuma` | Alias de `/tldr` (mesmo comportamento) |
| `/file-intel` | Processa pasta de docs e gera resumos (via Claude skill) |

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
| `/help` | Lista todos os comandos |

---

## Second Brain

Sistema de "segundo cerebro" integrado ao bot. Baseado no [second-brain](https://github.com/inematds/second-brain).

Armazena notas, documentos e contexto num vault local (pasta com arquivos `.md`). O Claude le suas notas antes de responder e salva resumos depois de cada sessao. O conhecimento acumula ao longo do tempo.

### O que e o vault

O vault e uma pasta no seu computador (`~/vault/` por padrao) com subpastas organizadas:

```
~/vault/
├── inbox/       Tudo entra aqui primeiro (notas, arquivos, docs)
├── daily/       Notas diarias automaticas (2026-03-17.md)
├── projects/    Uma pasta por projeto ativo
├── research/    Pesquisas e referencias
├── archive/     Coisas finalizadas (nunca deletar, so mover)
└── memory.md    Log de sessoes (atualizado pelo /tldr)
```

Voce nao precisa usar o app Obsidian. Funciona com qualquer editor ou so via bot.

### Setup do vault

```bash
# Criar vault a partir do template
cp -r vault-template/* ~/vault/

# (Opcional) Instalar deps Python para /file-intel
pip install -r requirements.txt

# (Opcional) Copiar skills para Claude Code global
cp -r skills/daily ~/.claude/skills/
cp -r skills/tldr ~/.claude/skills/
cp -r skills/file-intel ~/.claude/skills/
cp -r skills/vault-setup ~/.claude/skills/
```

O `VAULT_PATH` ja vem configurado como `~/vault` no `.env`. Para mudar, edite a variavel.

### Como salvar coisas no brain

Existem 3 formas de salvar conteudo no vault via Telegram:

#### 1. Comando /brain

```
/brain reuniao com cliente dia 20 sobre proposta de consultoria
```

Cria uma nota `.md` em `~/vault/inbox/` com o texto, datada automaticamente.

#### 2. Enviar arquivo com legenda

Envia qualquer arquivo (PDF, Word, planilha, imagem) pelo Telegram com a legenda:
- `/brain`
- "guarda isso"
- "salva no brain"

O arquivo vai direto para `~/vault/inbox/` com o nome original.

#### 3. Linguagem natural (triggers automaticos)

Nao precisa de comando. Escreve normalmente e o bot detecta a intencao:

| Frase | Exemplo |
|-------|---------|
| "guarda isso" | "guarda isso: senha do wifi e XYZ123" |
| "guarda isto" | "guarda isto que o cliente falou sobre prazo" |
| "salva isso" | "salva isso no brain" |
| "salva no brain" | "salva no brain: link do documento final" |
| "salva no cerebro" | "salva no cerebro: framework de precificacao" |
| "armazena isso" | "armazena isso: contato do fornecedor" |
| "memoriza isso" | "memoriza isso: preferencia do cliente por pagamento a vista" |
| "lembra disso" | "lembra disso: deploy programado pra sexta" |
| "manda pro brain" | "manda pro brain: notas da call de hoje" |
| "save this" | "save this: meeting notes from today" |
| "store this" | "store this: API endpoint documentation" |

O bot extrai o conteudo (tudo apos o trigger) e salva como nota em `~/vault/inbox/`.

### Como usar o vault no dia a dia

#### Standup matinal: /daily ou /dia

```
/daily
```

O bot (via Claude):
1. Abre ou cria a nota do dia em `~/vault/daily/2026-03-17.md`
2. Verifica se tem arquivos novos em `~/vault/inbox/`
3. Le o `memory.md` para contexto recente
4. Lista as 3 prioridades do dia
5. Pergunta: "What are we working on today?"

#### Resumo de sessao: /tldr ou /resuma

```
/tldr
```

O bot (via Claude):
1. Resume a conversa atual: decisoes, coisas para lembrar, proximos passos
2. Salva como nota `.md` na pasta mais relevante do vault (projects/, research/, ou daily/)
3. Appende um resumo no `~/vault/memory.md` com a data

O `memory.md` funciona como log acumulativo. Cada `/tldr` adiciona uma entrada. Com o tempo, o Claude pode ler esse arquivo para entender o historico de decisoes.

#### Processar documentos: /file-intel

```
/claude /file-intel
```

Ou pela linha de comando:

```bash
# Processar todos os arquivos de uma pasta
python scripts/process_files_with_gemini.py ~/Documents/contratos

# Converter docs em notas Obsidian direto no inbox
python scripts/process_docs_to_obsidian.py ~/Documents/contratos ~/vault/inbox
```

O processamento usa fallback automatico de LLM:
1. **Gemini** (Google AI Studio, gratis) — default, rapido
2. **Claude CLI** — se Gemini falhar (usa sua conta Claude)
3. **Ollama local** — se ambos falharem (gratis, mais lento)

Formatos suportados: PDF, PPTX, XLSX, DOCX, CSV, JSON, XML, MD, TXT, PY, JS, HTML, CSS, e qualquer arquivo texto.

Para cada arquivo processado, gera:
- `<nome>_summary.md` — resumo individual no formato Obsidian
- `MASTER_SUMMARY.md` — digest completo de todos os arquivos

A saida vai para `outputs/file_summaries/YYYY-MM-DD/`.

### Estrutura de uma nota salva

Quando voce manda `/brain <texto>`, a nota criada tem este formato:

```markdown
---
date: 2026-03-17
source: telegram
---

reuniao com cliente dia 20 sobre proposta de consultoria
```

Quando o `/file-intel` processa um documento, gera resumos mais elaborados com TL;DR, numeros, implicacoes e proximos passos.

### Fluxo completo recomendado

```
1. De manha:     /daily (ou /dia)
                  -> Bot mostra prioridades e o que tem no inbox

2. Durante o dia: Manda coisas pro brain quando surgem
                  -> "guarda isso: decisao X sobre projeto Y"
                  -> Envia PDF com legenda /brain

3. Recebe docs:  /claude /file-intel
                  -> Processa tudo e gera resumos

4. Fim do dia:   /tldr (ou /resuma)
                  -> Salva o que foi feito e decidido
```

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
| `VAULT_PATH` | Nao | Caminho do vault second brain (default: ~/vault) |
| `GOOGLE_API_KEY` | Nao | Gemini (gratis) para /file-intel e video |
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

### Deps Python (opcional, para /file-intel)

```bash
pip install -r requirements.txt
```

Pacotes: `google-genai`, `python-dotenv`, `python-docx`, `python-pptx`, `pillow`, `pdfplumber`, `openpyxl`

---

## Upstream

- Baseado no [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw). Docs completos em [CLAUDECLAW_GUIDE.md](./CLAUDECLAW_GUIDE.md).
- Second Brain baseado em [github.com/inematds/second-brain](https://github.com/inematds/second-brain).

---

## Licenca

MIT
