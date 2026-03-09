# Multi-Agent Architecture Plan

## Overview

Ollama acts as a local orchestrator (free, fast). Each execution agent is called explicitly via command or dispatched by the orchestrator when needed.

## Flow

```
Telegram msg
    |
    |-- /claude [model]      -> Claude Agent SDK (opus, sonnet, haiku)
    |-- /codex               -> Codex CLI subprocess
    |-- /ollama [model]      -> Ollama direct (qwen, llama, etc)
    |-- /openrouter [model]  -> OpenRouter API (deepseek, mistral, etc)
    |
    +-- (no prefix)
         |
         Ollama orchestrator
         |-- responds directly if simple
         +-- generates instructions + dispatches to the right agent
```

## Agents

### Claude Code SDK (current)
- Command: `/claude [model]`
- Models: opus, sonnet, haiku
- Capabilities: full tools (bash, file edit, grep, web search, sub-agents, skills)
- Auth: claude login (OAuth) or ANTHROPIC_API_KEY
- Limitation: plan quota (Pro/Max)

### Codex CLI
- Command: `/codex`
- Capabilities: file edit, bash, code generation
- Execution: subprocess `codex --full-auto "message"`
- Auth: OPENAI_API_KEY
- No event streaming like Claude SDK

### Ollama (local)
- Command: `/ollama [model]`
- Models: configurable (qwen2.5-coder, llama3.1, deepseek-coder, etc)
- Endpoint: http://localhost:11434/api/chat
- Capabilities: direct response, no system tools
- Cost: zero (runs locally)
- Dual role: orchestrator + direct agent

### OpenRouter
- Command: `/openrouter [model]`
- Models: any model available on OpenRouter (deepseek, mistral, claude, etc)
- Endpoint: https://openrouter.ai/api/v1/chat/completions
- Auth: OPENROUTER_API_KEY
- Capabilities: direct response, no system tools

## Orchestrator (Ollama)

Every message without an explicit command goes through Ollama as orchestrator:

1. Receives the user message
2. Classifies:
   - **Simple** (questions, conversations, translations) -> responds directly
   - **Code/tools** (edit file, run command, debug) -> dispatches to the right agent with instructions
   - **Heavy/multi-step** (large refactoring, deploy, complex analysis) -> dispatches to Claude
3. Returns the response or the dispatched agent's result

### Classification prompt (example)

```
You are a router. Analyze the message and respond ONLY with JSON:
- {"action": "respond", "response": "..."} if you can answer directly
- {"action": "route", "agent": "claude|codex|openrouter", "instructions": "..."} if an agent is needed
```

## Model configuration

Each system has its active model, switchable at runtime:

| System      | Command              | Example                              |
|-------------|----------------------|--------------------------------------|
| Claude      | `/claude [model]`    | `/claude sonnet`                     |
| Ollama      | `/ollama [model]`    | `/ollama qwen2.5-coder`             |
| OpenRouter  | `/openrouter [model]`| `/openrouter deepseek/deepseek-coder`|
| Codex       | `/codex`             | fixed model (OpenAI)                 |

Command `/models` shows the active model for each system.

## Required environment variables

```env
# Already existing
TELEGRAM_BOT_TOKEN=
ALLOWED_CHAT_ID=

# New
OPENAI_API_KEY=          # For Codex CLI
OPENROUTER_API_KEY=      # For OpenRouter
OLLAMA_MODEL=qwen2.5-coder  # Default Ollama model
OLLAMA_ROUTER_MODEL=     # Orchestrator model (can be smaller/faster)
OLLAMA_URL=http://localhost:11434  # Ollama endpoint
```

## Prerequisites

- [ ] Ollama installed and running (`ollama serve`)
- [ ] At least one model in Ollama (`ollama pull qwen2.5-coder`)
- [ ] Codex CLI installed (optional)
- [ ] OpenRouter API key (optional)
- [ ] OpenAI API key (optional, for Codex)

## Implementation

### Files to create/modify

1. `src/router.ts` — Ollama orchestrator (classification + dispatch)
2. `src/ollama.ts` — Ollama client (direct chat + classification)
3. `src/openrouter.ts` — OpenRouter client
4. `src/codex.ts` — Codex CLI subprocess
5. `src/bot.ts` — New commands (/ollama, /codex, /openrouter, /models)
6. `src/config.ts` — New environment variables
7. `.env.example` — New variables documented
