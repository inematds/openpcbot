# Multi-Agent Architecture Plan

## Visao geral

Ollama atua como orquestrador local (gratis, rapido). Cada agente de execucao e chamado explicitamente via comando ou pelo orquestrador quando necessario.

## Fluxo

```
Telegram msg
    |
    |-- /claude [model]      -> Claude Agent SDK (opus, sonnet, haiku)
    |-- /codex               -> Codex CLI subprocess
    |-- /ollama [model]      -> Ollama direto (qwen, llama, etc)
    |-- /openrouter [model]  -> OpenRouter API (deepseek, mistral, etc)
    |
    +-- (sem prefixo)
         |
         Ollama orquestrador
         |-- responde direto se e simples
         +-- gera instrucoes + despacha pro agente certo
```

## Agentes

### Claude Code SDK (atual)
- Comando: `/claude [model]`
- Modelos: opus, sonnet, haiku
- Capacidades: tools completas (bash, file edit, grep, web search, sub-agents, skills)
- Auth: claude login (OAuth) ou ANTHROPIC_API_KEY
- Limitacao: quota do plano (Pro/Max)

### Codex CLI
- Comando: `/codex`
- Capacidades: file edit, bash, code generation
- Execucao: subprocess `codex --full-auto "mensagem"`
- Auth: OPENAI_API_KEY
- Sem streaming de eventos como o Claude SDK

### Ollama (local)
- Comando: `/ollama [model]`
- Modelos: configuravel (qwen2.5-coder, llama3.1, deepseek-coder, etc)
- Endpoint: http://localhost:11434/api/chat
- Capacidades: resposta direta, sem tools de sistema
- Custo: zero (roda local)
- Papel duplo: orquestrador + agente direto

### OpenRouter
- Comando: `/openrouter [model]`
- Modelos: qualquer modelo disponivel no OpenRouter (deepseek, mistral, claude, etc)
- Endpoint: https://openrouter.ai/api/v1/chat/completions
- Auth: OPENROUTER_API_KEY
- Capacidades: resposta direta, sem tools de sistema

## Orquestrador (Ollama)

Toda mensagem sem comando explicito passa pelo Ollama como orquestrador:

1. Recebe a mensagem do usuario
2. Classifica:
   - **Simples** (perguntas, conversas, traducoes) -> responde direto
   - **Codigo/tools** (editar arquivo, rodar comando, debug) -> despacha pro agente certo com instrucoes
   - **Pesado/multi-step** (refactoring grande, deploy, analise complexa) -> despacha pro Claude
3. Retorna a resposta ou o resultado do agente despachado

### Prompt de classificacao (exemplo)

```
Voce e um roteador. Analise a mensagem e responda APENAS com JSON:
- {"action": "respond", "response": "..."} se conseguir responder direto
- {"action": "route", "agent": "claude|codex|openrouter", "instructions": "..."} se precisar de um agente
```

## Configuracao de modelos

Cada sistema tem seu modelo ativo, trocavel em runtime:

| Sistema     | Comando              | Exemplo                              |
|-------------|----------------------|--------------------------------------|
| Claude      | `/claude [model]`    | `/claude sonnet`                     |
| Ollama      | `/ollama [model]`    | `/ollama qwen2.5-coder`             |
| OpenRouter  | `/openrouter [model]`| `/openrouter deepseek/deepseek-coder`|
| Codex       | `/codex`             | modelo fixo (OpenAI)                 |

Comando `/models` mostra o modelo ativo de cada sistema.

## Variaveis de ambiente necessarias

```env
# Ja existentes
TELEGRAM_BOT_TOKEN=
ALLOWED_CHAT_ID=

# Novos
OPENAI_API_KEY=          # Para Codex CLI
OPENROUTER_API_KEY=      # Para OpenRouter
OLLAMA_MODEL=qwen2.5-coder  # Modelo padrao do Ollama
OLLAMA_ROUTER_MODEL=     # Modelo do orquestrador (pode ser menor/mais rapido)
OLLAMA_URL=http://localhost:11434  # Endpoint do Ollama
```

## Prerequisitos

- [ ] Ollama instalado e rodando (`ollama serve`)
- [ ] Pelo menos um modelo no Ollama (`ollama pull qwen2.5-coder`)
- [ ] Codex CLI instalado (opcional)
- [ ] API key do OpenRouter (opcional)
- [ ] API key da OpenAI (opcional, para Codex)

## Implementacao

### Arquivos a criar/modificar

1. `src/router.ts` — Ollama orquestrador (classificacao + despacho)
2. `src/ollama.ts` — Client Ollama (chat direto + classificacao)
3. `src/openrouter.ts` — Client OpenRouter
4. `src/codex.ts` — Subprocess Codex CLI
5. `src/bot.ts` — Novos comandos (/ollama, /codex, /openrouter, /models)
6. `src/config.ts` — Novas variaveis de ambiente
7. `.env.example` — Novas variaveis documentadas
