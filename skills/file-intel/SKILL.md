---
name: file-intel
description: Process any folder of files through Gemini/Claude/Ollama — extracts content from PDF, PPTX, XLSX, DOCX, CSV, JSON, and any text format, then generates Obsidian-ready summaries. Use when asked to "summarise this folder", "run file intel", "process these files", or a folder path is provided and summaries are needed.
---

# File Intel — Document Processor

Runs `scripts/process_files_with_gemini.py` on a folder of files and produces Obsidian-ready summaries.
Uses fallback chain: Gemini (free) -> Claude CLI -> Ollama local.

## Step 1: Get the folder

Ask the user which folder to process. Default to the vault inbox if VAULT_PATH is set:
- Vault inbox: `$VAULT_PATH/inbox/`
- Custom path: whatever the user specifies

## Step 2: Run the script

```bash
cd /home/nmaldaner/projetos/openpcbot
python scripts/process_files_with_gemini.py <folder_path>
```

Show the terminal output as it runs so the user can see files being processed live.

## Step 3: Report back

Tell the user:
- How many files were processed
- Which LLM backend was used (Gemini, Claude, or Ollama)
- Where the summaries landed (`outputs/file_summaries/YYYY-MM-DD/`)
- Point them to `MASTER_SUMMARY.md` as the single-file digest
- Suggest: "Sort everything in inbox/ into the right folders" if processing inbox

## Supported formats

PDF, PPTX, XLSX, DOCX, CSV, JSON, XML, MD, TXT, PY, JS, HTML, CSS, and any text file.

## Output

- Each file gets its own `*_summary.md`
- `MASTER_SUMMARY.md` combines all summaries
- Summaries adapt format: deliverables (invoices, reports) vs reference files (code, config) get different structures
