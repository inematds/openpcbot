---
name: daily
description: Start the day with vault context. Read today's daily note or create one. Surface top priorities. Ask what we're working on.
---

# Daily — Morning Standup

Get the vault path from VAULT_PATH env var (default: ~/vault).

Read today's daily note at `$VAULT_PATH/daily/YYYY-MM-DD.md` (use today's actual date).

If it doesn't exist, create it with this template:

```markdown
# [Today's Date — Day of Week]

## Top of Mind

## Today's Focus

## Notes
```

Then:
1. Check `$VAULT_PATH/inbox/` and list any unprocessed files found
2. Read the most relevant active project or client folder for context
3. Check `$VAULT_PATH/memory.md` for recent session summaries
4. Summarize the top 3 priorities for today based on recent notes

Ask: "What are we working on today?"
