---
name: tldr
description: Save a summary of this conversation to the vault. Key decisions, things to remember, next actions. Store in the right folder automatically.
---

# TL;DR — Session Summary

Get the vault path from VAULT_PATH env var (default: ~/vault).

Summarize this conversation:
1. What was decided or figured out
2. Key things to remember
3. Next actions (if any)

Format as a clean markdown note with today's date in the title.

Save to the most relevant folder based on the topic discussed:
- Client work: `$VAULT_PATH/clients/[name]/` or `$VAULT_PATH/projects/[name]/`
- Research: `$VAULT_PATH/research/`
- General: `$VAULT_PATH/daily/` with today's date

Also append a brief summary to `$VAULT_PATH/memory.md` under the session log:

```markdown
---

### [Today's Date]
- [1-line summary of what was decided]
- [Key thing to remember]
- Next: [action item if any]
```
