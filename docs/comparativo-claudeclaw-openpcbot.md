# Relatório Comparativo: ClaudeClaw vs OpenPCBot

**Data:** 2026-03-25

## Resumo

OpenPCBot (v2.5.0) é a evolução do ClaudeClaw (v1.1.0). O projeto foi renomeado e reestruturado com foco em **simplicidade e multi-agente**, removendo features enterprise e adicionando novas capacidades.

---

## Números

| Métrica | ClaudeClaw | OpenPCBot | Delta |
|---------|-----------|-----------|-------|
| Versão | 1.1.0 | 2.5.0 | +1.4.0 |
| Linhas de código (src/) | 14,163 | 8,085 | **-43%** |
| bot.ts | 65KB | 75KB | +15% |
| db.ts | 69KB | 29KB | **-57%** |
| dashboard-html.ts | 121KB | 48KB | **-60%** |
| Arquivos .ts em src/ | 38 | 28 | -10 |

---

## O que o ClaudeClaw tem e o OpenPCBot NÃO tem

| Feature | Arquivos |
|---------|----------|
| **Security system** (PIN lock, kill phrase, idle lock, audit log) | `security.ts` |
| **AES-256-GCM encryption** nos campos do banco | parte do `db.ts` |
| **Memory consolidation** (detecção de padrões cross-session) | `memory-consolidate.ts` |
| **Memory ingestion** (scoring de importância via Gemini) | `memory-ingest.ts` |
| **Embeddings** (vector search via Google API) | `embeddings.ts` |
| **Message queue** (serialização de mensagens) | `message-queue.ts` |
| **Mission Control** (kanban com drag-and-drop, auto-assign via Gemini) | parte do `dashboard-html.ts` |
| **Agent creation wizard** (CLI + dashboard) | `agent-create.ts`, `agent-create-cli.ts` |
| **Database migrations** | `migrations.ts` + `migrations/` |
| **Orchestrator** (delegação inter-agente com `@agentId:`) | `orchestrator.ts` |
| **Gemini integration** (video analysis, memory extraction) | `gemini.ts` |
| **Tests** | `*.test.ts` (4 arquivos) |
| **Skill: timezone** | `skills/timezone/` |

---

## O que o OpenPCBot tem e o ClaudeClaw NÃO tem

| Feature | Arquivos |
|---------|----------|
| **Multi-agent routing** (Ollama classifica e roteia) | `router.ts` |
| **Ollama integration** (LLM local gratuito) | `ollama.ts` |
| **OpenRouter integration** (multi-model API) | `openrouter.ts` |
| **Codex integration** (OpenAI coding agent) | `codex.ts` |
| **Sticky agent mode** (`/claude on`, `/ollama on`, etc.) | parte do `bot.ts` |
| **Project resolver** (contexto automático de projetos) | `project-resolver.ts` |
| **Second Brain** (vault .md com /brain, /daily, /tldr) | parte do `bot.ts` + skills |
| **Skills: daily, file-intel, vault-setup** | `skills/` |
| **Instant ACK** em mensagens de agente | v2.5.0 feature |

---

## Análise Arquitetural

**ClaudeClaw** é mais "enterprise":
- Segurança robusta (PIN, encryption, audit)
- Memory system sofisticado (consolidation, embeddings, ingestion)
- Dashboard pesado (121KB de HTML) com Mission Control
- Banco de dados complexo (69KB, encryption, migrations)
- Orchestrator formal para delegação inter-agente

**OpenPCBot** é mais "lean":
- Cortou 43% do código total
- Banco simplificado (-57%), sem encryption nos campos
- Dashboard enxuto (-60%), sem Mission Control
- Sem security layer (PIN, kill phrase)
- Compensou com multi-model (Ollama, OpenRouter, Codex)
- Adicionou Second Brain e project-aware context

---

## Conclusão

A migração ClaudeClaw -> OpenPCBot foi uma **refatoração agressiva** que priorizou:

1. **Simplicidade** - menos código, menos abstrações
2. **Multi-model** - não depender só do Claude (Ollama local, OpenRouter, Codex)
3. **Praticidade** - Second Brain, project resolver, sticky agent mode

O tradeoff: perdeu security hardening (PIN, encryption, audit), memory intelligence (consolidation, embeddings), Mission Control, e testes unitários. Se essas features forem necessárias no futuro, vale considerar portar de volta do ClaudeClaw.
