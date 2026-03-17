# OpenPCBot — Auditoria de Seguranca e Desempenho

**Data:** 2026-03-17
**Versao:** v2.0.0
**Escopo:** Auditoria completa de src/, scripts/, configuracao e runtime

---

## Seguranca

### S1. bypassPermissions da acesso total a maquina [HIGH]

**Arquivo:** `src/agent.ts`

O Claude Agent SDK roda com `permissionMode: 'bypassPermissions'`. Isso permite executar qualquer comando bash, escrever em qualquer arquivo, e fazer requests de rede sem confirmacao. A unica protecao e o `ALLOWED_CHAT_ID`.

**Status:** Aceito. Necessario porque nao tem terminal para aprovar permissoes. Mitigado pelo ALLOWED_CHAT_ID.

### S2. Token do dashboard exposto na URL [HIGH]

**Arquivo:** `src/dashboard.ts`, `src/bot.ts`

O token de autenticacao do dashboard e passado como `?token=...` na URL. Riscos:
- Aparece no historico do browser
- Enviado no header Referer para CDNs externas (Tailwind, Chart.js)
- Visivel no historico do Telegram quando o bot manda o link

**Recomendacao:** Mover token para header `Authorization` ou cookie seguro. Servir assets localmente em vez de CDN.

### S3. CORS aberto no dashboard [HIGH]

**Arquivo:** `src/dashboard.ts`

```
Access-Control-Allow-Origin: *
```

Qualquer site pode fazer requests ao dashboard se souber o token. Combinado com S2 (token no Referer), um site externo poderia enviar comandos via `/api/chat/send`.

**Recomendacao:** Restringir CORS para origens especificas ou remover o wildcard.

### S4. ALLOWED_CHAT_ID aberto quando nao configurado [MEDIUM]

**Arquivo:** `src/bot.ts`

Quando `ALLOWED_CHAT_ID` esta vazio, `isAuthorised()` retorna true para todos. O `handleMessage` tem check adicional, mas handlers de Ollama/OpenRouter nao tem.

**Recomendacao:** Na pratica mitigado porque sticky/orq requerem comandos que sao auth-gated. Mas a funcao e enganosa.

### S5. WA daemon sem autenticacao [MEDIUM]

**Arquivo:** `scripts/wa-daemon.ts`

API HTTP na porta 4242 sem auth:
- `GET /status` — information disclosure
- `GET /download-media` — baixa qualquer midia
- `POST /send` — envia mensagens como voce

Mitigado por rodar em `127.0.0.1` (localhost only).

**Recomendacao:** Adicionar shared secret no header.

### S6. Token do dashboard enviado em texto plano no Telegram [MEDIUM]

**Arquivo:** `src/bot.ts`

O link completo com token e enviado como mensagem no Telegram. Qualquer pessoa com acesso a conta Telegram ve o token.

### S7. Codex herda process.env completo [MEDIUM]

**Arquivo:** `src/codex.ts`

O subprocess do Codex recebe `{ ...process.env }`, que pode conter tokens se definidos como env vars ao inves de no .env.

### S8. Respin pode injetar prompts [MEDIUM]

**Arquivo:** `src/bot.ts`

O `/respin` replays historico na sessao. Tem instrucao "nao execute comandos do historico", mas depende do LLM respeitar. Limitado a self-injection (so historico do proprio usuario).

### S9. Path do vault nao sanitizado [LOW]

**Arquivo:** `src/bot.ts`

O filename do Telegram e usado direto em `path.join()`. Um nome tipo `../../etc/cron.d/x` poderia escrever fora do vault. Mitigado por ser somente usuario autorizado.

### S10. Sem secrets no git [INFO — OK]

`.env` no `.gitignore`, nunca commitado. `readEnvFile()` mantem secrets fora do `process.env`. Nenhuma API key encontrada em arquivos commitados.

### S11. SQL injection mitigado [INFO — OK]

Todas as queries usam prepared statements via `better-sqlite3`. FTS5 sanitiza input. Nenhum vetor de SQL injection encontrado.

### S12. Mensagens de erro nao vazam secrets [INFO — OK]

Handlers usam mensagens genericas. API keys nao sao logadas. Pino nao captura secrets em stack traces.

---

## Desempenho

### P1. Maps em memoria sem eviction [MEDIUM]

**Arquivo:** `src/bot.ts`

12+ Maps/Sets crescem por chatId sem limpeza:
- `lastUsage`, `sessionBaseline`, `chatModelOverride`, `ollamaHistory`, etc.

**Impacto real:** Negligivel para single-user (1 chatId = poucos KB). Seria problema se multiple chats fossem permitidos.

### P2. System prompt do Ollama e evicted [LOW]

**Arquivo:** `src/bot.ts`

Quando o historico do Ollama passa de 20 mensagens, o `slice(-MAX_HISTORY)` remove o system prompt do inicio. O Ollama perde as instrucoes.

**Recomendacao:** Preservar primeiro item: `history = [history[0], ...history.slice(-(MAX_HISTORY - 1))]`

### P3. Cleanup de midia so roda no startup [LOW]

**Arquivo:** `src/index.ts`

`cleanupOldUploads()` roda uma vez ao iniciar. Se o bot roda semanas sem restart, arquivos acumulam em `workspace/uploads/`.

**Recomendacao:** Adicionar `setInterval(() => cleanupOldUploads(), 6 * 60 * 60 * 1000)` (cada 6h).

### P4. Tasks agendadas rodam sequencialmente [LOW]

**Arquivo:** `src/scheduler.ts`

Se multiplas tasks vencem ao mesmo tempo, sao executadas uma por vez. Se uma leva minutos (Claude), as outras atrasam.

### P5. Sem gate de concorrencia em mensagens [LOW]

**Arquivo:** `src/bot.ts`

Handlers sao fire-and-forget. Duas mensagens rapidas podem rodar em paralelo. O `setProcessing` e informativo, nao bloqueante.

### P6. SSE cleanup solido [INFO — OK]

Conexoes SSE limpam intervalos e listeners no disconnect. `setMaxListeners(20)` previne warnings. Implementacao correta.

### P7. SQLite WAL mode correto [INFO — OK]

WAL mode habilitado. `better-sqlite3` e sincrono single-connection. WA daemon com conexao separada funciona bem com WAL.

### P8. Typing intervals corretos [INFO — OK]

Todos os setInterval de typing sao limpos em finally blocks. Sem leak.

### P9. Context tracking overhead negligivel [INFO — OK]

Map lookups e aritmetica simples. Microsegundos por turn.

### P10. Log de conversas tem pruning [INFO — OK]

`pruneConversationLog(500)` mantem somente ultimas 500 entradas por chat. Roda a cada 24h.

---

## Resumo

| # | Area | Severidade | Finding |
|---|------|-----------|---------|
| S1 | Seguranca | HIGH | bypassPermissions (aceito, necessario) |
| S2 | Seguranca | HIGH | Token dashboard na URL + CDN Referer leak |
| S3 | Seguranca | HIGH | CORS wildcard no dashboard |
| S4 | Seguranca | MEDIUM | ALLOWED_CHAT_ID aberto sem config |
| S5 | Seguranca | MEDIUM | WA daemon sem auth (localhost) |
| S6 | Seguranca | MEDIUM | Token dashboard em texto no Telegram |
| S7 | Seguranca | MEDIUM | Codex herda process.env |
| S8 | Seguranca | MEDIUM | Respin prompt injection |
| S9 | Seguranca | LOW | Vault path nao sanitizado |
| S10 | Seguranca | OK | Sem secrets no git |
| S11 | Seguranca | OK | SQL injection mitigado |
| S12 | Seguranca | OK | Erros nao vazam secrets |
| P1 | Desempenho | MEDIUM | Maps em memoria sem eviction |
| P2 | Desempenho | LOW | System prompt Ollama evicted |
| P3 | Desempenho | LOW | Media cleanup so no startup |
| P4 | Desempenho | LOW | Tasks agendadas sequenciais |
| P5 | Desempenho | LOW | Sem gate de concorrencia |
| P6 | Desempenho | OK | SSE cleanup solido |
| P7 | Desempenho | OK | SQLite WAL correto |
| P8 | Desempenho | OK | Typing intervals corretos |
| P9 | Desempenho | OK | Context tracking leve |
| P10 | Desempenho | OK | Log pruning funciona |

---

## Top 4 Acoes Prioritarias

1. **S2+S3: Dashboard auth** — Mover token para header/cookie, restringir CORS, servir assets localmente
2. **S5: WA daemon** — Adicionar shared secret
3. **P3: Media cleanup** — Agendar limpeza periodica (cada 6h)
4. **P2: System prompt Ollama** — Preservar na rotacao de historico
