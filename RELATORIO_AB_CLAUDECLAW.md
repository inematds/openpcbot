# O que o OpenPCBot pode captar do ClaudeClaw OS

**Data:** 2026-05-01
**Origem:** OpenPCBot v2.5.0 (fork) × ClaudeClaw OS v1.1.0 (upstream evoluído)
**Premissa:** os dois descendem do mesmo `earlyaidopters/claudeclaw`. O upstream evoluiu mais rápido em **infra, segurança e observabilidade**. O OpenPCBot evoluiu mais em **multi-LLM e second brain**. Este relatório cataloga só os subsistemas do ClaudeClaw OS que valem ser portados para o OpenPCBot.

---

## TL;DR — ranking por ROI

| # | O que captar | Esforço | Retorno | Por quê |
|---|--------------|---------|---------|---------|
| 1 | **Migrations SQL versionadas** | Baixo | Alto | Hoje qualquer schema change quebra prod |
| 2 | **Exfiltration guard** | Baixo | Alto | Bot tem acesso a Gmail/Drive/Slack — vazar key é só uma resposta de Claude |
| 3 | **Rate tracker + cost footer** | Baixo | Alto | Claude Max/API: você não sabe quanto cada turno custa |
| 4 | **OAuth health check** | Baixo | Médio | Token Slack/Google expira silenciosamente |
| 5 | **Skill registry + health** | Médio | Médio | Skill quebrada hoje só aparece quando o usuário tenta usar |
| 6 | **Memory consolidation (Gemini)** | Médio | Alto | Vault `.md` é leitura humana; consolidação é insight cross-session |
| 7 | **Embeddings + busca semântica** | Médio | Alto | FTS5 é literal; embedding pega "preço" ↔ "valor" ↔ "custo" |
| 8 | **Hooks system** | Médio | Médio | Plugar comportamento sem editar `bot.ts` |
| 9 | **Mission Control (orchestrator + queue)** | Alto | Alto | Delegar tarefa async pra agente sem travar a conversa |
| 10 | **Signal bridge** | Alto | Médio | Privacidade real além de Telegram/WhatsApp |
| 11 | **War Room (voz ao vivo)** | Muito alto | Baixo (a menos que use) | Brinquedo legal mas nicho |

Fazer 1–4 num final de semana já profissionaliza o OpenPCBot. 5–8 depois. 9–11 são projetos.

---

## 1. Migrations SQL versionadas — `src/migrations.ts` + pasta `migrations/`

**Estado atual no OpenPCBot:** schema vive todo no `db.ts` com `CREATE TABLE IF NOT EXISTS`. Adicionar coluna nova obriga a editar manualmente a tabela ou recriar o DB.

**Como o ClaudeClaw OS faz:**
- Pasta `migrations/` com arquivos `001_xxx.sql`, `002_xxx.sql`...
- `src/migrations.ts` (66 linhas) lê a pasta, compara contra tabela `_migrations` no SQLite, aplica em ordem, em transação.
- Roda no boot, antes de qualquer query.

**O que portar:**
1. Copiar `src/migrations.ts` direto.
2. Criar pasta `migrations/` no OpenPCBot.
3. Mover o `CREATE TABLE` de hoje para `001_initial.sql`.
4. Chamar `runMigrations(db)` no `src/db.ts` antes de retornar a conexão.

**Ganho:** schema evolui sem dor, sem perder dados.

---

## 2. Exfiltration guard — `src/exfiltration-guard.ts`

**Estado atual no OpenPCBot:** zero proteção. Se o Claude resolver imprimir o conteúdo do `.env` numa resposta (jailbreak, acidente, prompt injection vindo de um e-mail processado), vai direto pro Telegram.

**Como o ClaudeClaw OS faz:**
- 154 linhas, zero deps, só regex.
- Detecta `sk-ant-...`, `sk-...`, `xoxb-/xoxp-`, `ghp_/gho_`, `AKIA...`, hex de 41+ chars.
- Escapa SHAs git (whitelist).
- Aceita lista de "valores protegidos" do `.env` para bater raw + base64 + URL-encoded.
- Roda no `postMessage` antes de chamar `bot.sendMessage`.

**O que portar:**
1. Copiar `src/exfiltration-guard.ts` direto.
2. No `src/bot.ts` do OpenPCBot, antes de `ctx.reply(text)`, chamar `scan(text, protectedValues)`. Se houver match, redact e logar.
3. `protectedValues` = `[process.env.TELEGRAM_BOT_TOKEN, process.env.OPENAI_API_KEY, process.env.SLACK_USER_TOKEN, ...]`.

**Ganho:** uma camada de defesa simples contra vazamento. Custo: ~5ms por mensagem.

---

## 3. Rate tracker + cost footer — `src/rate-tracker.ts` + `src/cost-footer.ts`

**Estado atual no OpenPCBot:** você não sabe quanto cada turno do Claude custou nem quanto rodou no mês.

**Como o ClaudeClaw OS faz:**
- `rate-tracker.ts` (92 linhas): contabiliza tokens in/out por turno, salva em `token_usage` no SQLite.
- `cost-footer.ts` (59 linhas): calcula custo USD com base no modelo (Opus/Sonnet/Haiku) e adiciona rodapé opcional na resposta tipo `~$0.04 | 12k ctx`.
- Mesma tabela alimenta o `convolife` e o dashboard.

**O que portar:**
1. Copiar os dois arquivos.
2. Criar tabela `token_usage` via migration (item 1).
3. No final de cada turno do Claude (e Codex/OpenRouter, que também têm custo!), chamar `trackUsage(...)`.
4. Adicionar comando `/cost` ou `/billing` no bot mostrando custo do dia/semana/mês por agente.

**Ganho:** visibilidade financeira. Permite comparar quanto Codex × Claude × OpenRouter custam para o mesmo tipo de tarefa.

---

## 4. OAuth health check — `src/oauth-health.ts`

**Estado atual no OpenPCBot:** se o token Slack/Google expirar, o usuário descobre quando manda `/slack` e dá erro.

**Como o ClaudeClaw OS faz:**
- 139 linhas. Roda check periódico (cron interno) testando cada integração OAuth.
- Slack: chama `auth.test`. Google: pega lista de calendários. Etc.
- Resultado vai pra dashboard e dispara alerta no Telegram quando algo expira.

**O que portar:**
1. Copiar o arquivo.
2. Adicionar entry no scheduler para rodar a cada 6h.
3. Mandar notify quando algum check falhar.

**Ganho:** zero surpresa. Token expirado vira alerta, não bug silencioso.

---

## 5. Skill registry + health — `src/skill-registry.ts` + `src/skill-health.ts`

**Estado atual no OpenPCBot:** skills carregam de `~/.claude/skills/` e funcionam ou não. Se uma skill tem dependência Python quebrada, só descobre na hora.

**Como o ClaudeClaw OS faz:**
- `skill-registry.ts` (268 linhas): scaneia o diretório, parseia frontmatter de cada skill, cataloga triggers.
- `skill-health.ts` (144 linhas): testa pré-requisitos de cada skill (binários, env vars, deps Python).
- Allowlist por agente (commit `895aa19` no upstream): cada agente especialista declara quais skills pode usar — dispatch determinístico via slash command.

**O que portar:**
1. Copiar os dois.
2. Adicionar `/skills` no bot listando skills + status (verde/amarelo/vermelho).
3. Adicionar `skills_allowed:` no front-matter dos agentes especialistas e respeitar no dispatch.

**Ganho:** debug de skill quebrada vira 1 comando. Agentes especialistas ficam mais previsíveis.

---

## 6. Memory consolidation com Gemini — `src/memory-consolidate.ts`

**Estado atual no OpenPCBot:** vault `.md` + memória SQLite. Busca é literal (FTS5). Não há síntese cross-session.

**Como o ClaudeClaw OS faz:**
- 172 linhas. Roda periodicamente (ou via comando).
- Pega memórias `unconsolidated` recentes.
- Manda pro Gemini com prompt que pede: summary, insight, connections (from_id → to_id), **contradictions** (memória nova que invalida memória velha — usa timestamps).
- Salva resultado como `consolidation` na própria tabela de memórias, com embedding.
- Marca contradictions: a memória velha vira `stale`, a nova passa a ser autoridade.

**O que portar:**
1. Copiar `memory-consolidate.ts` (depende de `embeddings.ts` — item 7).
2. Schedule rodar 1×/dia ou após cada `/tldr`.
3. Bonus: rodar consolidação **sobre o vault** também — gera nota `~/vault/insights/2026-05-01.md` semanal.

**Ganho:** o segundo cérebro deixa de ser arquivo morto e passa a destilar padrões. Casa perfeitamente com o vault `.md` do OpenPCBot.

---

## 7. Embeddings + busca semântica — `src/embeddings.ts`

**Estado atual no OpenPCBot:** busca de memória só por FTS5 (texto literal). "Quanto cobrei do cliente X" não acha "valor proposto pra empresa X".

**Como o ClaudeClaw OS faz:**
- 48 linhas. Wrapper fino sobre embeddings (Gemini embedding API ou similar).
- Salva vetor em coluna BLOB ou tabela paralela.
- Memory recall: busca top-k por cosine similarity, fallback FTS5.

**O que portar:**
1. Copiar `embeddings.ts`.
2. Migration adicionando coluna `embedding BLOB` na tabela de memórias e na tabela de notas do vault.
3. No `/brain`, gerar embedding ao salvar.
4. Comando `/recall <query>` que busca semântica no vault.

**Ganho:** memória encontra coisas pelo significado, não pela palavra exata. Combina com consolidation (item 6).

---

## 8. Hooks system — `src/hooks.ts`

**Estado atual no OpenPCBot:** comportamento custom mora todo no `bot.ts`. Adicionar "loga toda mensagem em arquivo X" exige editar o handler.

**Como o ClaudeClaw OS faz:**
- 129 linhas. Registry com 5 pontos: `preMessage`, `postMessage`, `onSessionStart`, `onSessionEnd`, `onError`.
- Cada hook tem timeout de 5s e roda em paralelo.
- `exfiltration-guard`, `rate-tracker`, `cost-footer` são todos hooks.

**O que portar:**
1. Copiar `hooks.ts`.
2. Refatorar `bot.ts` para emitir `preMessage`/`postMessage` em vez de chamadas hardcoded.
3. Cada subsistema novo (ex: notify quando custo > X) vira hook, não edição do bot.

**Ganho:** extensibilidade limpa. Casa com a filosofia "tudo é skill" do projeto.

---

## 9. Mission Control: orchestrator + queue — `src/orchestrator.ts` + `src/mission-cli.ts` + `src/message-queue.ts` + `src/message-classifier.ts`

**Estado atual no OpenPCBot:** agentes especialistas existem (comms/content/ops/research) mas cada um é um **bot Telegram separado**. Não há fila assíncrona. Você fala com cada um diretamente.

**Como o ClaudeClaw OS faz:**
- `orchestrator.ts` (262 linhas): aceita "missões" — payload `{agent, title, prompt, priority}`.
- `mission-cli.ts` (143 linhas): CLI `mission-cli create --agent research --title X "prompt"`.
- `message-queue.ts` (55 linhas) + `message-classifier.ts` (85 linhas): fila persistente com prioridade, classificador decidindo agente.
- Dashboard mostra fila, status, resultado.
- O agente principal (`/claude`) pode delegar via missão sem bloquear.

**O que portar:**
1. Copiar os 4 arquivos como bloco.
2. Criar tabela `missions` via migration.
3. Adicionar `/mission research "investiga X"` no bot.
4. Resultado volta no Telegram quando o agente termina.

**Ganho:** delegação real. Hoje no OpenPCBot, "fala com o research" é trocar de bot. Com missões, é `/mission research X` e segue conversando enquanto o research trabalha.

**Atenção:** o roteador automático que o OpenPCBot já tem (`router.ts`) é **diferente** — ele escolhe **LLM** (Claude × Ollama × Codex). O orchestrator do ClaudeClaw escolhe **agente especialista** (research × comms). Os dois coexistem bem.

---

## 10. Signal bridge — `src/signal-bot.ts` + `src/signal-rpc.ts`

**Estado atual no OpenPCBot:** Telegram + WhatsApp. Sem Signal.

**Como o ClaudeClaw OS faz:**
- 774 + 305 linhas. Usa `signal-cli` rodando como daemon e fala via JSON-RPC.
- Bridge isomórfica: mesma lógica de bot, transport diferente.

**O que portar:** copiar os dois arquivos + ajustar config. Setup é mais chato (precisa registrar número Signal), por isso fica em #10.

**Ganho:** privacidade. Quem prefere Signal a WhatsApp ganha o canal.

**Quando NÃO portar:** se você não usa Signal, pula. É infra cara para benefício de nicho.

---

## 11. War Room — `src/warroom-html.ts` + `src/agent-voice-bridge.ts` + `src/daily-client.ts`

**Estado atual no OpenPCBot:** sem nada equivalente.

**Como o ClaudeClaw OS faz:**
- ~2200 linhas no total. Sala de voz ao vivo via Pipecat + Daily.co + Gemini Live.
- Você "entra" numa call e conversa com seus agentes especialistas em tempo real.

**Quando NÃO portar:** quase sempre. É feature impressionante mas com setup pesado (Python venv, Pipecat, Daily.co API). ROI baixo a menos que você de fato faça reuniões com o time-de-IA.

---

## Plano de ação sugerido (3 sprints)

### Sprint 1 — Profissionalização (final de semana)
- [ ] Migrations versionadas (item 1)
- [ ] Exfiltration guard (item 2)
- [ ] Rate tracker + cost footer (item 3)
- [ ] OAuth health (item 4)

### Sprint 2 — Inteligência (1–2 semanas)
- [ ] Embeddings + busca semântica (item 7)
- [ ] Memory consolidation com Gemini (item 6) — **integrar com vault** (gerar `~/vault/insights/`)
- [ ] Skill registry + health (item 5)
- [ ] Hooks system (item 8) — refatorar os 4 itens do Sprint 1 para virarem hooks

### Sprint 3 — Delegação real (projeto)
- [ ] Mission Control completo (item 9)
- [ ] Signal bridge (item 10) — só se você usa Signal
- [ ] War Room (item 11) — só se for fazer call com agentes

---

## O que NÃO faz sentido portar

- **Ecossistema launchd (mac):** OpenPCBot é Linux/systemd. Manter assim.
- **`agents/_template` com propagação de capabilities (commit `e048a32`):** o OpenPCBot já tem agentes especialistas. Pode olhar a ideia mas não precisa do código.
- **Pikastream skill:** nicho.
- **`battle-test.ts`:** o OpenPCBot já tem multi-LLM nativo, dá pra fazer comparação melhor com o que tem.

---

## Anexo — onde cada arquivo fica no ClaudeClaw OS

```
src/migrations.ts           66 linhas
migrations/                 pasta de SQL
src/exfiltration-guard.ts  154 linhas
src/security.ts            214 linhas
src/rate-tracker.ts         92 linhas
src/cost-footer.ts          59 linhas
src/oauth-health.ts        139 linhas
src/skill-registry.ts      268 linhas
src/skill-health.ts        144 linhas
src/embeddings.ts           48 linhas
src/memory-consolidate.ts  172 linhas
src/hooks.ts               129 linhas
src/orchestrator.ts        262 linhas
src/mission-cli.ts         143 linhas
src/message-queue.ts        55 linhas
src/message-classifier.ts   85 linhas
src/signal-bot.ts          774 linhas
src/signal-rpc.ts          305 linhas
src/warroom-html.ts       1958 linhas
src/agent-voice-bridge.ts  217 linhas
```

Total Sprint 1+2 (itens 1–8): ~1.500 linhas. Sprint 3 todo: ~3.700 linhas.
