# Analise de Impacto: Renomear "claudeclaw" no sistema

Status: PENDENTE — analise para decisao

As referencias de "ClaudeClaw" em texto visivel ao usuario ja foram trocadas para "OpenPCBot".
Este documento lista as referencias de sistema que ainda usam "claudeclaw" e o impacto de mudar cada uma.

---

## 1. Database: `store/claudeclaw.db`

**Arquivos que referenciam:**
- `src/db.ts:151` — path do banco: `path.join(STORE_DIR, 'claudeclaw.db')`
- `scripts/wa-daemon.ts:22` — `path.join(STORE_DIR, 'claudeclaw.db')`
- `scripts/status.ts:193` — health check
- `CLAUDE.md` — comandos sqlite3 no checkpoint/convolife
- `agents/comms/CLAUDE.md`, `agents/ops/CLAUDE.md`, `agents/content/CLAUDE.md`, `agents/research/CLAUDE.md` — hive_mind inserts
- `agents/_template/CLAUDE.md` — hive_mind queries

**Impacto de mudar para `openpcbot.db`:**
- RISCO ALTO: o banco atual ja tem dados (memorias, sessoes, tasks, conversas)
- Precisa de migration: renomear o arquivo fisico + mudar todas as referencias
- Se errar, perde historico do bot
- Agentes que referenciam o path fixo no CLAUDE.md param de funcionar

**Recomendacao:** Mudar. E simples mas precisa:
1. Parar o bot
2. `mv store/claudeclaw.db store/openpcbot.db`
3. Atualizar src/db.ts, scripts/wa-daemon.ts, scripts/status.ts
4. Atualizar CLAUDE.md e todos os agents/*/CLAUDE.md
5. Rebuild + restart

---

## 2. PID file: `store/claudeclaw.pid`

**Arquivos que referenciam:**
- `src/index.ts:38` — `claudeclaw.pid` para o agente main
- `src/dashboard.ts:209` — le o PID do main

**Impacto de mudar para `openpcbot.pid`:**
- RISCO BAIXO: o PID e recriado a cada restart
- Nao tem dados persistentes

**Recomendacao:** Mudar. Sem risco.

---

## 3. package.json: `"name": "claudeclaw"`

**Arquivos:**
- `package.json:2`
- `package-lock.json:2,8`

**Impacto de mudar para `"openpcbot"`:**
- RISCO BAIXO: o name no package.json e metadata
- Se tiver scripts que referenciam o name, podem quebrar
- package-lock.json regenera com `npm install`

**Recomendacao:** Mudar. Sem risco funcional.

---

## 4. macOS plist: `claudeclaw.plist`

**Arquivo:** `claudeclaw.plist` (inteiro)
- Label: `com.claudeclaw.app`
- Paths: `PATH_TO_CLAUDECLAW`
- Logs: `/tmp/claudeclaw.log`, `/tmp/claudeclaw.err`

**Impacto:**
- RISCO NENHUM neste deploy (estamos em Linux, nao usamos plist)
- So afeta se alguem usar o projeto no macOS

**Recomendacao:** Mudar label e paths. Renomear arquivo para `openpcbot.plist`.

---

## 5. systemd service names nos scripts

**Arquivos:**
- `scripts/setup.ts:733` — cria `claudeclaw.service`
- `scripts/setup.ts:755-756` — `systemctl enable/start claudeclaw`
- `scripts/status.ts:172,185` — checa `claudeclaw` service
- `scripts/agent-service.sh:23` — `com.claudeclaw.agent-*`

**Impacto:**
- RISCO MEDIO: o servico real ja se chama `openpcbot.service` (configurado manualmente)
- Os scripts de setup/status ainda procuram por `claudeclaw` — estao incorretos
- O agent-service.sh cria servicos com prefixo `com.claudeclaw.agent-`

**Recomendacao:** Mudar. Os scripts estao desatualizados em relacao ao deploy atual.

---

## 6. Env var: `CLAUDECLAW_DIR`

**Arquivos:**
- `skills/gmail/SKILL.md` — 15+ referencias a `CLAUDECLAW_DIR=/path/to/claudeclaw`
- `skills/google-calendar/SKILL.md` — 12+ referencias

**Impacto de mudar:**
- RISCO MEDIO: se alguem ja configurou os skills com CLAUDECLAW_DIR, quebra
- Os scripts Python (gmail.py, gcal.py) leem essa variavel
- Mudanca precisa ser em: skills, scripts Python, .env.example

**Recomendacao:** Mudar para `OPENPCBOT_DIR` mas manter backward compatibility (fallback para CLAUDECLAW_DIR).

---

## 7. Test files

**Arquivos:**
- `src/env.test.ts:6` — `/tmp/claudeclaw-env-test`
- `src/file-send.integration.test.ts` — `claudeclaw-test` em nomes temporarios

**Impacto:** RISCO NENHUM. Sao paths temporarios de teste.

**Recomendacao:** Mudar. Cosmetic.

---

## 8. openrouter.ts HTTP headers

**Ja mudado** para 'OpenPCBot'.

---

## 9. CLAUDE.md (instrucoes do bot)

**Referencias restantes:**
- `[PATH TO CLAUDECLAW]` em multiplos lugares (schedule-cli, notify.sh, convolife, checkpoint)
- `store/claudeclaw.db` em comandos sqlite3

**Impacto:**
- RISCO ALTO: este arquivo e carregado em toda sessao Claude Code
- Se os paths estiverem errados, comandos como convolife e checkpoint falham

**Recomendacao:** Mudar para paths reais (`/home/nmaldaner/projetos/openpcbot`).

---

## Resumo de acoes

| Item | Risco | Acao |
|------|-------|------|
| claudeclaw.db -> openpcbot.db | Alto | Rename + update refs |
| claudeclaw.pid -> openpcbot.pid | Baixo | Update refs |
| package.json name | Baixo | Rename |
| claudeclaw.plist -> openpcbot.plist | Nenhum | Rename |
| systemd refs nos scripts | Medio | Update para openpcbot |
| CLAUDECLAW_DIR env var | Medio | Rename com fallback |
| Test files | Nenhum | Cosmetic rename |
| CLAUDE.md paths | Alto | Update para paths reais |

**Ordem sugerida de execucao:**
1. Parar o bot
2. Renomear DB: `mv store/claudeclaw.db store/openpcbot.db`
3. Atualizar todos os refs no codigo
4. Atualizar CLAUDE.md com paths reais
5. Rebuild
6. Restart
7. Testar: convolife, checkpoint, scheduled tasks, memoria
