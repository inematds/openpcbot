# TODO — Sistema de Memória do OpenPCBot

Lista de melhorias identificadas em `COMO_ARMAZENA_CONHECIMENTO.md`. Cada item está aguardando decisão do usuário (perguntado via Telegram em 2026-05-01).

---

## #1 — Suporte PT-BR no SEMANTIC_SIGNALS [PRIORIDADE ALTA]

**Problema:** o regex em `src/memory.ts:13` só detecta sinais semânticos em inglês:

```javascript
const SEMANTIC_SIGNALS = /\b(my|i am|i'm|i prefer|remember|always|never)\b/i;
```

Resultado: mensagens em PT-BR como "eu prefiro modo escuro", "minha cachorra chama Mel", "nunca esqueça do deploy de sexta" caem todas em `episodic` (decay rápido) em vez de `semantic` (longa duração).

**Por que importa:** o usuário fala primariamente PT-BR. O sistema está descartando memórias importantes dele todos os dias por incompatibilidade de idioma.

**Fix proposto** (`src/memory.ts:13`):

```javascript
const SEMANTIC_SIGNALS = /\b(my|i am|i'm|i prefer|remember|always|never|meu|minha|eu sou|eu (?:tô|estou)|eu prefiro|lembr[ae]|sempre|nunca|gosto de|odeio|preciso|quero)\b/i;
```

Termos PT-BR adicionados:
- `meu`, `minha` — posse (equivale a "my")
- `eu sou`, `eu tô`, `eu estou` — identidade (equivale a "i am")
- `eu prefiro` — preferência (equivale a "i prefer")
- `lembra`, `lembre` — memória explícita (equivale a "remember")
- `sempre`, `nunca` — frequência absoluta (equivale a "always/never")
- `gosto de`, `odeio` — preferência forte
- `preciso`, `quero` — desejo/necessidade durável

**Esforço:** 5 minutos. Editar 1 linha + rebuild.

**Status:** ⏳ aguardando confirmação do usuário

---

## #2 — Integração SQLite ↔ Vault

**Problema:** os dois sistemas de memória são paralelos e não conversam.
- `/brain X` salva só no vault. Não vai para `memories`.
- Memória SQLite extraída automaticamente nunca chega ao vault.

**Fix proposto:**
- Quando `/brain` salva, também chamar `saveMemory(chatId, content, 'semantic')`.
- Quando regex SEMANTIC detecta um signal forte, também escrever em `~/vault/inbox/`.

**Esforço:** 1-2h.

**Status:** ⏳ aguardando confirmação do usuário

---

## #3 — Busca semântica via embeddings

**Problema:** FTS5 é busca literal. "preço" não acha "valor", "deploy" não acha "publicação".

**Fix proposto:** copiar `src/embeddings.ts` (48 linhas) do ClaudeClaw OS. Adicionar coluna `embedding BLOB` em `memories` via migration. Usar Gemini embedding API (grátis). Busca cosine similarity como camada 1, FTS5 como fallback.

**Esforço:** 5h.

**Status:** ⏳ aguardando confirmação do usuário

---

## #4 — Auto-injeção do vault no contexto

**Problema:** o vault só é lido em `/daily`, `/tldr`, `/file-intel`. Conhecimento valioso fica preso esperando comando.

**Fix proposto:** rodar memory consolidation Gemini diariamente sobre o vault inteiro, gerando 3-5 bullets de insights em `~/vault/insights/YYYY-MM-DD.md`. Esse arquivo entra no `buildMemoryContext()` automaticamente em toda mensagem.

**Esforço:** 6h. Depende de #3 (embeddings).

**Status:** ⏳ aguardando confirmação do usuário

---

## #5 — Deduplicação semântica

**Problema:** "my dog is Rex" dito 10x vira 10 linhas em `memories`. Polui contexto e infla salience artificialmente.

**Fix proposto:** ao salvar memória nova, comparar embedding contra top-10 mais recentes. Se similaridade > 0.92, fazer `UPDATE` em vez de `INSERT` — só bumpa `accessed_at` e `salience`.

**Esforço:** 3h. Depende de #3 (embeddings).

**Status:** ⏳ aguardando confirmação do usuário

---

## Notas

- Itens 3, 4, 5 dependem do #3 (embeddings) — fazer nessa ordem.
- Item #1 é independente e pode ir primeiro.
- Item #2 também é independente, mas com pouco valor sem #3.

**Origem desta lista:** análise comparativa em `RELATORIO_AB_GANHOS.md` + investigação direta em `src/memory.ts` e `src/db.ts`.
