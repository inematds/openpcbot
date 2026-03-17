---
name: vault-setup
description: Interactive Obsidian vault configurator. Asks the user to describe themselves in free text, then builds a personalized vault structure, CLAUDE.md, and slash commands directly in the configured VAULT_PATH.
---

# Vault Setup — Obsidian Configurator

Run this to set up or reconfigure the second brain vault.

## STEP 1 — One question, free text

Display this message exactly, then wait for their response:

---

**Tell me about yourself in a few sentences so I can build your vault.**

Answer these in whatever order feels natural:

- What do you do for work?
- What falls through the cracks most — what do you wish you tracked better?
- Work only, or personal life too?
- Do you have existing files to import? (PDFs, docs, slides)

No need to be formal. A few sentences is enough.

---

## STEP 2 — Infer and preview, don't ask more questions

From their free-text answer, infer:
- Their role (business owner / developer / consultant / creator / student)
- Their primary pain point
- Scope (work only / work + personal / full life OS)
- Whether they have existing files

Get the vault path from the VAULT_PATH env var (default: ~/vault).

Then show a vault preview. Do NOT ask clarifying questions. Make smart inferences.

```
Here's your vault — ready to build when you are.

[vault path]
├── inbox/          Drop zone — everything new lands here first
├── daily/          Daily brain dumps and quick captures
├── [folder]/       [purpose based on their role]
├── [folder]/       [purpose based on their role]
├── [folder]/       [purpose based on their role]
├── projects/       Active work with status and next actions
└── archive/        Completed work — never deleted, just moved

Slash commands:
  /daily    — start your day with vault context
  /tldr     — save any session to the right folder
  /file-intel — process docs with Gemini/Claude/Ollama

Type "build it" to create this, or tell me what to change.
```

Wait for confirmation before building anything.

## STEP 3 — Build after confirmation

Once they say "build it", "yes", "go", "looks good", or similar:

### Create folders
```bash
VAULT=$VAULT_PATH  # from .env, default ~/vault
mkdir -p $VAULT/{inbox,daily,projects,research,archive}
```

Role folder sets:
- Business Owner: `people/ operations/ decisions/`
- Developer: `research/ clients/`
- Consultant: `clients/ research/`
- Creator: `content/ research/ clients/`
- Student: `notes/ research/`

If personal scope: also `personal/`

### Write vault CLAUDE.md
Write to `$VAULT/CLAUDE.md`:

```markdown
# Second Brain — [inferred role]

## Who I Am
[2-3 sentences based on what they told you]

## Vault Structure
[folder tree with one-line purpose per folder]

## Context Rules
When I mention a decision: check decisions/ or relevant folder first
When I mention a person/client/project: look in the relevant folder
When I ask you to write: read recent daily/ notes to match my voice
When something lands in inbox/: ask if I want it sorted now
```

### Write memory.md
```bash
cat > $VAULT/memory.md << 'EOF'
# Memory

This file is updated after each session via /tldr.
Tracks key decisions, context, and continuations across conversations.

---

<!-- session summaries appended below -->
EOF
```

## STEP 4 — Final output

```
Done. Your vault is ready at [VAULT_PATH].

Your slash commands:
  /daily      — run this every morning
  /tldr       — run at the end of any session
  /file-intel — process a folder of docs

Have files to import?
  python scripts/process_docs_to_obsidian.py ~/your-files [VAULT_PATH]/inbox/
  Then: "Sort everything in inbox/ into the right folders"
```
