# Features para Portar do ClaudeClaw para o OpenPCBot

**Data:** 2026-03-25

---

## 1. Sistema de Memória (consolidation + ingestion + embeddings)

Hoje o OpenPCBot tem memória **simples**: salva mensagens que contêm palavras-chave como "my", "I prefer", "remember" via regex, e busca por FTS5 (full-text search por palavras).

O ClaudeClaw tem **3 camadas a mais**:

### Memory Ingestion (`memory-ingest.ts`)
Depois de cada troca de mensagem, o Gemini analisa se vale salvar. Ele:
- Avalia importância de 0 a 1 (só salva >= 0.5)
- Extrai entidades e tópicos estruturados
- Filtra noise agressivamente (comandos, acks, tarefas pontuais)
- Gera embedding e checa duplicatas por cosine similarity (> 0.85 = skip)
- Notifica no Telegram quando salva algo com importância >= 0.8

**O que tu ganha:** hoje o bot salva "eu prefiro python" mas também salva lixo como "eu acho que o build falhou". O ingestion do ClaudeClaw é muito mais seletivo e inteligente.

### Memory Consolidation (`memory-consolidate.ts`)
A cada 30 min, pega memórias não consolidadas e manda pro Gemini encontrar:
- **Padrões cross-session** (ex: "o usuário sempre prioriza velocidade sobre qualidade")
- **Conexões** entre memórias (liga memory A com memory B e descreve a relação)
- **Contradições** (se tu disse "uso React" há 2 meses e agora disse "migrei pra Vue", marca a antiga como superseded)

**O que tu ganha:** memória que se auto-organiza e se auto-corrige. Sem isso, memórias antigas contradizem novas e poluem o contexto.

### Embeddings (`embeddings.ts`)
Vector search via Google Gemini embedding model (768 dimensões). Busca por **significado** em vez de palavras.

**O que tu ganha:** buscar "como o Nico gosta de organizar projetos" encontra memórias que não contêm essas palavras exatas mas são semanticamente relacionadas. FTS5 sozinho não faz isso.

**Custo:** depende do `GOOGLE_API_KEY` (Gemini). As chamadas são leves (embedding é barato, consolidation usa ~500 tokens por batch).

---

## 2. Mission Control

É um **kanban de tarefas** no dashboard web com 4 features principais:

- **Criar tarefas** com título + prompt, ficam na coluna "Unassigned"
- **Colunas por agente** (main, comms, ops, research) -- drag-and-drop pra atribuir
- **Auto-assign via Gemini** -- clica um botão, o Gemini lê o prompt e decide qual agente é melhor
- **Histórico** com resultados completos de cada tarefa executada

**O que tu ganha:** hoje tu gerencia tarefas agendadas pelo cron, mas não tem um board visual pra criar tarefas ad-hoc e atribuir pra agentes. Mission Control é útil se tu usa múltiplos agents (comms, ops, etc.) e quer delegar visualmente. Se tu usa basicamente só o main agent, o ganho é menor.

---

## 3. Testes

O ClaudeClaw tem **14 arquivos de teste** com ~2,900 linhas cobrindo:

| Arquivo | Cobre |
|---------|-------|
| `bot.test.ts` | Handler de mensagens, routing |
| `db.test.ts` | Schema, queries, migrations |
| `memory.test.ts` | FTS5, decay, context building |
| `memory-ingest.test.ts` | Extração, duplicatas |
| `memory-consolidate.test.ts` | Padrões, contradições |
| `scheduler.test.ts` | Cron, timeouts |
| `schedule-cli.test.ts` | CLI commands |
| `voice.test.ts` | STT/TTS pipeline |
| `media.test.ts` | File download/upload |
| `obsidian.test.ts` | Vault reading |
| `gemini.test.ts` | API wrapper |
| `migrations.test.ts` | Schema versioning |
| `env.test.ts` | Config validation |
| `file-send.integration.test.ts` | E2E file sending |

**O que tu ganha:** segurança pra refatorar. Hoje se tu muda o `db.ts` ou `memory.ts`, não tem como saber se quebrou algo sem testar manualmente. Com os testes, `npm test` te diz em segundos. Especialmente importante pra um bot que roda 24/7 -- tu quer pegar regressões antes de deployar.

---

## Resumo prático

| Feature | Valor se portar | Esforço | Depende de |
|---------|----------------|---------|------------|
| Memory Ingestion | Alto -- memória muito mais inteligente | Médio | GOOGLE_API_KEY |
| Memory Consolidation | Alto -- auto-organização + contradições | Médio | Ingestion + GOOGLE_API_KEY |
| Embeddings | Médio -- semantic search é melhor que FTS5 | Baixo | GOOGLE_API_KEY |
| Mission Control | Baixo/Médio -- útil só com multi-agent ativo | Alto (dashboard rewrite) | Dashboard |
| Testes | Alto -- safety net pra refactors | Médio (adaptar pro schema atual) | vitest |

## Prioridade sugerida

1. **Testes** (proteção) -- base pra tudo
2. **Memory Ingestion + Embeddings** (qualidade da memória)
3. **Memory Consolidation** (refinamento)
4. **Mission Control** (só se multi-agent estiver ativo)
