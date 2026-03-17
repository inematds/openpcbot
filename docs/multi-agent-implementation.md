# Multi-Agent Implementation Report

## Status: Implemented (2026-03-08)

## What was built

Multi-agent system with direct access to Claude, Codex, Ollama, and OpenRouter via Telegram commands. Ollama responds by default (free, local). Optional orchestrator mode auto-classifies and dispatches.

## Architecture

```
Telegram msg
    |
    |-- /claude <msg>              -> Claude Agent SDK (full tools: bash, files, web)
    |-- /codex <msg>               -> Codex CLI subprocess (full-auto)
    |-- /ollama <msg>              -> Ollama direct chat (local, free)
    |-- /openrouter <msg>          -> OpenRouter API (multi-model)
    |
    +-- (no prefix)
         |
         |-- [/orq OFF — default] -> Ollama responds directly (qwen2.5:14b)
         |
         +-- [/orq ON]            -> Orchestrator (llama3.2, lightweight)
              |-- classifies message via JSON prompt
              |-- "simple" -> responds directly
              +-- "needs tools" -> dispatches to claude/codex/openrouter
```

## Files created

| File | Purpose |
|------|---------|
| `src/ollama.ts` | Ollama client: chat, health check, list models |
| `src/openrouter.ts` | OpenRouter API client with chat completions |
| `src/codex.ts` | Codex CLI subprocess runner (full-auto mode) |
| `src/router.ts` | Ollama orchestrator: classify + dispatch messages |

## Files modified

| File | Changes |
|------|---------|
| `src/config.ts` | Added OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ROUTER_MODEL, OPENROUTER_API_KEY, OPENROUTER_MODEL |
| `src/bot.ts` | Added /claude, /ollama, /codex, /openrouter, /models, /orq commands. Added handler functions for each agent. Default message flow goes to Ollama. Orchestrator is opt-in via /orq. Ollama has system prompt explaining multi-agent context. |
| `.env.example` | Documented new multi-agent env vars |
| `.env` | Added default Ollama + OpenRouter config |

## Telegram commands

### Agents (send to specific agent)
| Command | Description |
|---------|-------------|
| `/claude <msg>` | Send to Claude Agent SDK (full tools: bash, file edit, web search) |
| `/codex <msg>` | Send to Codex CLI (OpenAI, full-auto mode) |
| `/ollama <msg>` | Send directly to Ollama |
| `/openrouter <msg>` | Send to OpenRouter API |

### Model management
| Command | Description |
|---------|-------------|
| `/model <name>` | Switch Claude model (opus/sonnet/haiku) |
| `/ollama model <name>` | Switch Ollama model |
| `/openrouter model <name>` | Switch OpenRouter model |
| `/models` | Show active model for each agent |

### History management
| Command | Description |
|---------|-------------|
| `/ollama clear` | Clear Ollama conversation history |
| `/openrouter clear` | Clear OpenRouter conversation history |
| `/newchat` | Clear Claude session |

### Orchestrator
| Command | Description |
|---------|-------------|
| `/orq` | Toggle orchestrator on/off |

When OFF (default): messages without a command go straight to Ollama.
When ON: a lightweight model (llama3.2) classifies the message and auto-dispatches to the best agent.

## Default models configured

| System | Model | Role |
|--------|-------|------|
| Ollama (direct) | `qwen2.5:14b` | Default responder for all messages |
| Ollama (router) | `llama3.2` | Orchestrator / classifier (when /orq is ON) |
| Claude | `claude-opus-4-6` | Full coding agent with tools |
| OpenRouter | `deepseek/deepseek-chat` | API chat (needs key) |
| Codex | OpenAI default | Coding agent CLI |

## Environment variables

```env
# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_ROUTER_MODEL=llama3.2

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-chat

# Codex (uses OPENAI_API_KEY from env)
```

## How the orchestrator works (when /orq is ON)

1. Every message without a command prefix goes to `handleRoutedMessage()`
2. Checks if Ollama is available (health check on router model)
3. If unavailable, falls back directly to Claude
4. If available, sends message to `routeMessage()` in `src/router.ts`
5. Router uses a system prompt that instructs the model to return JSON:
   - `{"action":"respond","response":"..."}` for simple messages
   - `{"action":"route","agent":"claude|codex|openrouter","instructions":"..."}` for tool tasks
6. Dispatches to the chosen agent or sends the direct response

## How default mode works (when /orq is OFF)

1. Messages without a command go to `handleOllamaMessage()`
2. Ollama receives the message with a system prompt that explains it's part of OpenPCBot
3. If the user asks for tool-based tasks, Ollama tells them to use /claude or /codex
4. Conversation history is maintained in-memory (max 20 messages)

## Conversation history

- Claude: persistent sessions via Claude Agent SDK (survives across messages)
- Ollama: in-memory history per chat (max 20 messages, resets on restart)
- OpenRouter: in-memory history per chat (max 20 messages, resets on restart)
- Codex: stateless (each message is independent)

## Ollama system prompt

When Ollama is used as direct responder, it gets this system prompt:
> You are a helpful assistant running inside OpenPCBot, a multi-agent Telegram bot. You answer questions directly. If the user asks you to edit files, run commands, deploy code, or do anything that requires system tools, tell them to use /claude or /codex — those agents have full tool access. Keep responses concise.

## Prerequisites

- Ollama installed and running (`ollama serve`)
- At least one model pulled (`ollama pull qwen2.5:14b` + `ollama pull llama3.2`)
- Codex CLI installed (`npm i -g @openai/codex`) + OPENAI_API_KEY (optional)
- OpenRouter API key (optional)
