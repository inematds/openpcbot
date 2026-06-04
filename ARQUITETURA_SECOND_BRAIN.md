# Como o OpenPCBot usa o Second Brain

**Data:** 2026-05-01
**Fonte:** análise direta de `src/bot.ts`, `src/config.ts`, `vault-template/`, `skills/`

---

## TL;DR

A arquitetura é mais enxuta do que parece: o bot faz **escrita direta** no vault, mas a **leitura/síntese** é delegada pro Claude com prompt construído em runtime. O vault é uma pasta `~/vault/` com `.md` puro — não tem indexação, não tem DB paralelo. Claude usa Read/Write/Bash para ler. Bot usa `fs` para escrever.

---

## 1. Estrutura do vault (`vault-template/`)

```
~/vault/
├── inbox/          tudo entra aqui (notas, arquivos jogados)
├── daily/          notas diárias (YYYY-MM-DD.md)
├── projects/       uma pasta por projeto
├── research/       referências
├── archive/        finalizados (mover, nunca deletar)
├── memory.md       log acumulativo (appended por /tldr)
└── CLAUDE.md       instruções do vault
```

`VAULT_PATH` lido do `.env` em `src/config.ts:107-110`. Default `~/vault`. Resolvido com `~` expandido para `$HOME` na const `VAULT_PATH_RESOLVED`.

---

## 2. Os 3 caminhos de **escrita** (bot.ts faz direto, sem Claude)

### a) Comando `/brain <texto>` — `bot.ts:1333-1341`

- Cria `note-2026-05-01T14-23-11.md` em `~/vault/inbox/`
- Adiciona frontmatter:
  ```yaml
  ---
  date: 2026-05-01
  source: telegram
  ---
  ```
- Função: `saveToBrain()` em `bot.ts:145-160`

### b) Arquivo com legenda `/brain` ou trigger natural — `bot.ts:1637-1641`

- `cp` do arquivo do Telegram para `~/vault/inbox/<filename>`
- Função: `saveFileToBrain()` em `bot.ts:162-174`

### c) Triggers de linguagem natural — `bot.ts:135` (regex) + `bot.ts:1381-1389`

```regex
/\b(guard[ae]\s+(isso|isto|este)|salv[ae]\s+(isso|isto|no brain|no cerebro)|
armazen[ae]\s+(isso|isto)|memoriz[ae]\s+(isso|isto)|lemb?r[ae]\s+dis[st]o|
save this|store this|manda\s+pr[ao]\s+brain)\b/i
```

Detecta em mensagem normal, extrai o conteúdo depois do trigger (`stripBrainTrigger`), salva no inbox. Sem precisar de slash.

| Frase exemplo | Resultado |
|---------------|-----------|
| `guarda isso: senha do wifi é XYZ123` | Salva "senha do wifi é XYZ123" |
| `salva no brain o link do documento` | Salva "o link do documento" |
| `lembra disso, deploy sexta` | Salva "deploy sexta" |
| `save this: meeting notes` | Salva "meeting notes" |

---

## 3. **Leitura/síntese** — bot manda prompt, Claude faz o trabalho

Sacada principal: `/daily` e `/tldr` **não tocam no filesystem direto**. Eles só constroem um prompt e mandam pro Claude via `handleMessage()`. O Claude, com Read/Write/Bash, é quem lê e escreve o vault.

### `/daily` ou `/dia` — `bot.ts:1344-1354`

```
Read the vault at ~/vault.
Check today's daily note at ~/vault/daily/ (create if missing).
Check ~/vault/inbox/ for unprocessed files.
Read ~/vault/memory.md for recent context.
Summarize top 3 priorities. Ask: "What are we working on today?"
```

### `/tldr` ou `/resuma` — `bot.ts:1357-1366`

```
Summarize this conversation: decisions, key things to remember, next actions.
Save as a markdown note in the most relevant folder under ~/vault
(projects/, research/, or daily/).
Also append a brief summary to ~/vault/memory.md with today's date.
```

Claude usa as skills `daily` (`skills/daily/SKILL.md`) e `tldr` (`skills/tldr/SKILL.md`) que estão em `~/.claude/skills/` para guiar o comportamento. Cada skill tem o template do markdown a gerar.

---

## 4. **Processamento de docs** — `/file-intel`

Skill em `skills/file-intel/SKILL.md`. Quando ativada, roda script Python:

```bash
python scripts/process_files_with_gemini.py <folder>
```

Cadeia de fallback:
1. **Gemini** (Google AI Studio, grátis) — default
2. **Claude CLI** — se Gemini falhar
3. **Ollama local** — se ambos falharem

**Formatos suportados:** PDF, PPTX, XLSX, DOCX, CSV, JSON, XML, MD, TXT, PY, JS, HTML, CSS, e qualquer texto.

**Output:** `outputs/file_summaries/YYYY-MM-DD/<nome>_summary.md` + `MASTER_SUMMARY.md` (digest geral).

---

## 5. O que o `memory.md` faz

É um **log acumulativo append-only**. Cada `/tldr` adiciona uma entrada datada com 2-3 bullets. Com o tempo vira o "diário de bordo" do bot. O `/daily` lê esse arquivo para ter contexto recente.

Formato típico:

```markdown
---

### 2026-05-01
- Decidido: usar Gemini para file-intel por padrão
- Lembrar: cliente X prefere comunicação async
- Next: revisar proposta até sexta

---

### 2026-05-02
- ...
```

---

## Fluxo de uso típico

```
Manhã:    /daily          → Claude lê vault + memory.md + inbox, lista 3 prioridades
Durante:  "guarda isso: X" → bot.ts escreve direto em ~/vault/inbox/
          PDF + /brain     → bot.ts copia pra ~/vault/inbox/
Fim dia:  /tldr           → Claude resume conversa, salva nota em pasta certa,
                            appenda em memory.md
Quando precisa:  /file-intel ~/vault/inbox/ → Gemini/Claude/Ollama processam tudo
```

---

## Pontos fortes do design

1. **Bot escreve direto, Claude lê via tools.** Não duplica lógica de FS no Node.
2. **Vault é só `.md`.** Funciona com Obsidian, VSCode, `cat`, qualquer editor.
3. **Triggers naturais.** Não precisa decorar comando.
4. **memory.md como log acumulativo** dá um "histórico de decisões" legível.
5. **File-intel com 3 fallbacks** sobrevive a falha de qualquer LLM.

## Pontos fracos / oportunidades

| Limitação atual | Como resolver |
|-----------------|---------------|
| Sem busca semântica — `grep` não acha "preço" quando você escreveu "valor" | Embeddings (item 7 do RELATORIO_AB_GANHOS.md) |
| Sem síntese cross-vault — `memory.md` cresce sem ser destilado | Memory consolidation com Gemini (item 6) |
| Inbox pode lotar — sem rotina automática movendo de `inbox/` para `projects/` ou `archive/` | Cron rodando Claude periodicamente para classificar inbox |
| Sem índice — cada `/daily` Claude lê vault inteiro de novo (caro em vault grande) | Cache em SQLite com hash dos arquivos |

---

## Mapa de arquivos relevantes

```
src/config.ts:107-110            VAULT_PATH e VAULT_PATH_RESOLVED
src/bot.ts:135                   regex BRAIN_TRIGGER
src/bot.ts:137-143               isBrainTrigger() / stripBrainTrigger()
src/bot.ts:145-160               saveToBrain()
src/bot.ts:162-174               saveFileToBrain()
src/bot.ts:1333-1341             handler /brain
src/bot.ts:1344-1354             handler /daily, /dia
src/bot.ts:1357-1366             handler /tldr, /resuma
src/bot.ts:1381-1389             trigger natural em mensagem texto
src/bot.ts:1637-1641             trigger natural em arquivo enviado
skills/daily/SKILL.md            template + lógica do standup matinal
skills/tldr/SKILL.md             template + lógica do resumo
skills/file-intel/SKILL.md       lógica do processador de docs
skills/vault-setup/SKILL.md      configurador interativo do vault
scripts/process_files_with_gemini.py    pipeline Python com fallback
scripts/process_docs_to_obsidian.py     conversor Obsidian
vault-template/                  template pronto para cp -r
```
