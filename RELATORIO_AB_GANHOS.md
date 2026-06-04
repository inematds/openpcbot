# Tabela de ganhos — captações do ClaudeClaw OS para o OpenPCBot

**Data:** 2026-05-01

---

## Tabela mestra

| # | Captação | Esforço | Linhas | Ganho concreto | Risco evitado | Métrica de sucesso |
|---|----------|---------|--------|----------------|---------------|---------------------|
| 1 | Migrations SQL versionadas | 2h | ~70 | Schema evolui sem perder dados; deploy sem `DROP TABLE` | Quebra de DB em update | `_migrations` tabela com 100% das mudanças aplicadas |
| 2 | Exfiltration guard | 1h | ~155 | Bloqueia API keys, tokens Slack/GitHub/AWS antes do `sendMessage` | Vazar `sk-ant-...` no Telegram | 0 secrets enviados (logar tentativas) |
| 3 | Rate tracker + cost footer | 3h | ~150 | Custo USD por turno, por agente, por dia | Surpresa na fatura Anthropic | `/cost` mostrando $X/dia em <1s |
| 4 | OAuth health | 2h | ~140 | Alerta automático quando token Slack/Google expira | Bug silencioso descoberto pelo usuário | Mean time to detection < 6h |
| 5 | Skill registry + health | 4h | ~410 | `/skills` lista todas com verde/amarelo/vermelho | Skill quebrada que ninguém sabia | 100% das skills com status conhecido |
| 6 | Memory consolidation (Gemini) | 6h | ~170 | Insight diário cross-session em `~/vault/insights/` | Vault virar arquivo morto | 1 nota de insight/dia automática |
| 7 | Embeddings + busca semântica | 5h | ~50 + migration | `/recall <query>` acha por significado, não palavra | Memória útil "perdida" por sinônimo | Recall@5 > 80% em queries de teste |
| 8 | Hooks system | 4h | ~130 | Adicionar comportamento sem editar `bot.ts` | Acoplamento crescente | 100% dos itens 2/3/4 viram hooks |
| 9 | Mission Control (orchestrator + queue) | 12h | ~545 | `/mission research X` async, sem trocar de bot | Bloquear conversa esperando agente | Tarefas async com tempo médio < 5min |
| 10 | Signal bridge | 8h | ~1080 | Canal Signal além de Telegram/WhatsApp | Dependência de 1 plataforma | Bot respondendo em Signal |
| 11 | War Room (voz ao vivo) | 16h+ | ~2200 | Call de voz com time de agentes via Gemini Live | — | Só se for usar de fato |

**Totais:**
- Sprint 1 (itens 1-4): **8h, ~515 linhas, 4 ganhos críticos de infra**
- Sprint 2 (itens 5-8): **19h, ~760 linhas, inteligência semântica + extensibilidade**
- Sprint 3 (itens 9-11): **36h+, ~3825 linhas, recursos avançados**

---

## Ganhos por dimensão

### Segurança

| Captação | O que protege | Severidade hoje |
|----------|---------------|-----------------|
| Exfiltration guard (#2) | API keys, tokens, AWS keys, hex 40+ | **Alta** — qualquer prompt injection vaza secrets |
| OAuth health (#4) | Detecção de token expirado | Média — bug silencioso |

### Custo

| Captação | Visibilidade | Hoje |
|----------|--------------|------|
| Rate tracker (#3) | Tokens in/out por turno | **Cego** |
| Cost footer (#3) | $ USD por modelo (Opus/Sonnet/Haiku) | **Cego** |
| Comparação multi-LLM | Claude × Codex × OpenRouter no mesmo prompt | **Cego** (mesmo já tendo multi-LLM!) |

### Confiabilidade

| Captação | Falha que elimina |
|----------|-------------------|
| Migrations (#1) | "Por que sumiu a coluna X?" |
| Skill registry (#5) | "Por que essa skill nunca rodou?" |
| OAuth health (#4) | "Faz dias que o /slack não funciona" |

### Inteligência do Second Brain

| Captação | Hoje | Depois |
|----------|------|--------|
| Embeddings (#7) | FTS5 literal — "preço" não acha "valor" | Cosine similarity — significado |
| Memory consolidation (#6) | Notas acumulam sem síntese | Insight diário no vault |
| Combo #6 + #7 sobre vault | Vault = arquivo morto | Vault = segundo cérebro real |

### Arquitetura

| Captação | Antes | Depois |
|----------|-------|--------|
| Hooks system (#8) | Edição de `bot.ts` para cada feature | Plugar listener em `preMessage`/`postMessage` |
| Mission Control (#9) | "Fala com o research" = trocar de bot | `/mission research X` async |

---

## Matriz esforço × retorno

```
                 RETORNO
                 BAIXO          MÉDIO              ALTO
ESFORÇO  BAIXO   .              OAuth health(#4)   Migrations(#1)
                                                   Exfil guard(#2)
                                                   Cost track(#3)

         MÉDIO   .              Skill reg(#5)      Embeddings(#7)
                                Hooks(#8)          Mem consol(#6)

         ALTO    War Room(#11)  Signal(#10)        Mission(#9)
```

**Conclusão:** quadrante alto-retorno-baixo-esforço (canto superior direito) tem 3 itens. **Faça esses 3 primeiro.** Os outros têm boa relação mas são opcionais.

---

## Priorização recomendada

| Prioridade | Itens | Justificativa |
|------------|-------|---------------|
| **P0 — Fazer agora** | #1, #2, #3 | 6h de trabalho, elimina 3 buracos de produção |
| **P1 — Próximas 2 semanas** | #4, #6, #7, #8 | Constrói a inteligência do second brain |
| **P2 — Quando der tempo** | #5, #9 | Polimento + delegação real |
| **P3 — Só se usar** | #10, #11 | Nicho |

---

## Ganho intangível

Além dos números, captar do upstream traz:
- **Compatibilidade futura:** se o ClaudeClaw OS adicionar feature nova, fica mais fácil portar mantendo as mesmas convenções.
- **Revisão de código grátis:** o upstream já apanhou nos bugs. Você herda o aprendizado.
- **Comunidade:** se um dia abrir o OpenPCBot, ter as mesmas primitivas baixa o atrito.
