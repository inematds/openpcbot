# Second Brain

## Who I Am
[Run /vault-setup to personalize this file.]

## Vault Structure
```
inbox/      <- Drop any file here. Claude sorts it.
daily/      <- Daily notes (YYYY-MM-DD.md)
projects/   <- Active projects and briefs
research/   <- Notes, synthesis, saved ideas
archive/    <- Completed work. Never delete, just archive.
```

## Context Rules
When starting the day:
-> Read daily/[today's date].md if it exists
-> Check inbox/ for any unprocessed files

When working on a project:
-> Read projects/[name]/ before starting

When writing anything:
-> Read recent notes first to calibrate voice and context

## How to Maintain
- New files from outside -> inbox/ first, sort later
- Daily notes -> daily/YYYY-MM-DD.md
- Completed work -> archive/ (never delete)
- Update this file whenever conventions change

## Slash Commands
- /vault-setup  — Personalize this vault
- /daily        — Start the day with vault context
- /tldr         — Save session summary to vault
- /file-intel   — Process docs with Gemini/Claude/Ollama
