# Como o OpenPCBot armazena e busca conhecimento

**Data:** 2026-05-01
**Fonte:** análise de `src/memory.ts`, `src/db.ts`, `src/bot.ts`, `vault-template/`

---

## TL;DR

Existem **dois sistemas paralelos** rodando ao mesmo tempo. O usuário só vê um (o vault), o outro é invisível e automático.

```
                    ┌─────────────────────────┐
                    │    Mensagem chega       │
                    └─────────┬───────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼                               ▼
   ┌──────────────────┐         ┌─────────────────────┐
   │  SISTEMA 1       │         │  SISTEMA 2          │
   │  SQLite memory   │         │  Vault .md          │
   │  (automático)    │         │  (explícito)        │
   └──────────────────┘         └─────────────────────┘
   Sempre roda                    Só com trigger
   Invisível ao user              Visível, editável
   Decay automático               Permanente
```

---

## Sistema 1 — Memória SQLite (automática, invisível)

### Quando salva (gatilho automático) — `memory.ts:79-95`

**Toda mensagem do usuário com mais de 20 chars e sem `/` no início é salva.** Sem perguntar, sem comando.

A categoria depende de regex:

```javascript
const SEMANTIC_SIGNALS = /\b(my|i am|i'm|i prefer|remember|always|never)\b/i;
```

| Mensagem | Setor | Por quê |
|----------|-------|---------|
| `"i prefer dark mode"` | **semantic** | bate "i prefer" |
| `"my dog's name is Rex"` | **semantic** | bate "my" |
| `"remember the meeting"` | **semantic** | bate "remember" |
| `"como tá o tempo hoje"` | **episodic** | nenhum signal bate |
| `"oi"` (≤20 chars) | nenhum | descartado |
| `/brain X` (começa com /) | nenhum | descartado |

**Limitação crítica:** o regex é só inglês. Mensagem em PT-BR como "eu prefiro modo escuro" cai em **episodic** porque nenhum signal bate. Ver `TODO_MEMORIA.md`.

### Onde salva — tabela `memories` + FTS5 (`db.ts:32-45`)

```sql
CREATE TABLE memories (
  id          INTEGER PRIMARY KEY,
  chat_id     TEXT NOT NULL,
  topic_key   TEXT,
  content     TEXT NOT NULL,
  sector      TEXT NOT NULL DEFAULT 'semantic',  -- semantic | episodic
  salience    REAL NOT NULL DEFAULT 1.0,
  created_at  INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL
);

-- Tabela paralela com índice full-text
CREATE VIRTUAL TABLE memories_fts USING fts5(content);
```

Triggers automáticos espelham `memories` em `memories_fts` (insert/update/delete).

### Salience — relevância que decai e cresce — `db.ts:294-303`

| Evento | Efeito |
|--------|--------|
| Memória criada | salience = 1.0 |
| Memória recuperada (`touchMemory`) | salience += 0.1 (cap 5.0) |
| Decay diário (`decayMemories`) | salience *= 0.98 |
| salience < 0.1 | **deletada** |

Resultado: memória útil cresce, memória ignorada some. Sem intervenção do usuário.

### Quando busca — toda mensagem nova — `memory.ts:23-58`

Antes de mandar mensagem pro Claude/Ollama/OpenRouter, **roda `buildMemoryContext()`**:

**Camada 1 — busca por palavra-chave (FTS5):**
```sql
SELECT * FROM memories
JOIN memories_fts ON memories.id = memories_fts.rowid
WHERE memories_fts MATCH ? AND memories.chat_id = ?
ORDER BY rank LIMIT 3
```

Sanitiza a query do user, vira `"palavra1"* "palavra2"*` (prefix match). Top 3.

**Camada 2 — recência:**
```sql
SELECT * FROM memories WHERE chat_id = ?
ORDER BY accessed_at DESC LIMIT 5
```

Mais 5 mais recentes (deduplicadas contra a camada 1).

**Resultado injetado no prompt:**
```
[Memory context]
- i prefer dark mode (semantic)
- my dog's name is Rex (semantic)
- meeting tomorrow at 3pm (episodic)
[End memory context]

<mensagem do usuário aqui>
```

O Claude (e os outros LLMs) recebem esse bloco automaticamente.

### Onde isso é chamado — `bot.ts`

| Linha | Quando |
|-------|--------|
| `bot.ts:388` | Antes de chamar Ollama |
| `bot.ts:447` | Antes de chamar OpenRouter |
| `bot.ts:613` | Antes de chamar Claude |
| `bot.ts:1729` | Em outro fluxo |

**Toda mensagem que vai pra um LLM passa por aqui.** É invisível.

---

## Sistema 2 — Vault `.md` (explícito, visível)

### Quando salva — só com trigger explícito

| Trigger | Quem detecta | Onde grava |
|---------|--------------|------------|
| `/brain <texto>` | `bot.ts:1333` | `~/vault/inbox/note-TIMESTAMP.md` |
| Regex `BRAIN_TRIGGER` em mensagem | `bot.ts:1381` | `~/vault/inbox/note-TIMESTAMP.md` |
| Arquivo + legenda `/brain` | `bot.ts:1639` | `~/vault/inbox/<filename>` |
| `/tldr` ou `/resuma` | Claude via prompt | pasta certa do vault + `memory.md` |

### Quando busca — só com comando explícito

| Comando | O que faz |
|---------|-----------|
| `/daily` | Claude lê `~/vault/daily/`, `~/vault/inbox/`, `~/vault/memory.md` |
| `/tldr` | Claude lê conversa atual e escreve resumo no vault |
| `/file-intel` | Script Python processa pasta com fallback Gemini→Claude→Ollama |

**Nada é lido do vault sem o usuário pedir explicitamente.**

---

## Tabela comparativa dos dois sistemas

| Dimensão | Sistema 1 (SQLite) | Sistema 2 (Vault) |
|----------|--------------------|--------------------|
| Quando salva | Automático, toda msg > 20 chars | Trigger explícito |
| Quem decide o que salvar | Regex (`my/i am/prefer/remember`) | Usuário com `/brain` ou frase natural |
| Onde mora | `store/openpcbot.db` | `~/vault/*.md` |
| Formato | Texto cru numa coluna | Markdown com frontmatter |
| Busca | FTS5 (palavra literal) + recência | Claude lê o vault todo via `find/grep/Read` |
| Quando é usado | Toda mensagem (injeção automática) | Só em `/daily`, `/tldr`, `/file-intel` |
| Decay | Sim, 2%/dia, deleta <0.1 | Não, permanente |
| Visibilidade | Invisível (DB) | Editável em qualquer editor |
| Tamanho | Limite implícito via decay | Cresce sem limite |

---

## Como o bot "sabe" o que armazenar

**Sistema 1 (SQLite):** sabe porque **salva tudo automaticamente**. Critério é grosseiro: tamanho > 20, não começa com `/`. Filtro de "importância" é o regex inglês que decide entre `semantic` (longa duração) e `episodic` (decay rápido). Não há LLM julgando importância — é regex burro mesmo.

**Sistema 2 (Vault):** sabe porque **o usuário pediu**. Ou via `/brain`, ou via frase como "guarda isso", ou via arquivo com legenda. O bot não decide — o humano decide.

## Como o bot "sabe" quando buscar

**Sistema 1:** busca **antes de cada turno**. Sem condição, sempre. Pega 3 por palavra-chave + 5 por recência, joga no prompt do LLM.

**Sistema 2:** busca **só quando o humano comanda**. Sem `/daily`, `/tldr` ou pergunta explícita ao Claude, o vault não é lido.

---

## 5 buracos no design atual (oportunidades)

1. **Regex SEMANTIC_SIGNALS é só inglês.** Mensagem PT-BR cai sempre em `episodic` e some rápido. Fix: adicionar termos PT-BR ao regex.

2. **SQLite e vault não conversam.** `/brain` não vai pro SQLite. Memória SQLite não vai pro vault. Os dois sistemas são paralelos e ignoram um ao outro.

3. **Busca FTS5 é literal.** "preço" não acha "valor". Resolve com embeddings.

4. **Vault não é injetado automaticamente.** Só via `/daily`. Conhecimento valioso fica esperando você pedir. Resolve com memory consolidation Gemini que destila vault em insights pequenos que entram no contexto automático.

5. **Não há deduplicação semântica.** Se você falar 10x "my dog is Rex", vira 10 entradas separadas no SQLite.
