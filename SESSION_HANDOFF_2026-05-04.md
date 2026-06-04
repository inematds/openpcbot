# Session Handoff — Análise comparativa ClaudeClaw OS × OpenPCBot + auditoria de memória

**Data:** 2026-05-04

## Where it started
Usuário pediu resumo do projeto claudeclaw-os, depois comparação com "openpcbot" (que está em /home/nmaldaner/projetos/openpcbot, fork do mesmo upstream). Conversa evoluiu para análise reversa (o que openpcbot pode absorver), tabela de ganhos, deep-dive no second brain, e auditoria do sistema de memória do openpcbot. Terminou com notify via Telegram pedindo decisão sobre 5 melhorias.

## Applied / shipped
- [confirmed] Relatório de comparação — `/home/nmaldaner/projetos/claudeclaw-os/docs/comparacao-openpcbot.md`
- [confirmed] Relatório de captações com plano de 3 sprints — `/home/nmaldaner/projetos/openpcbot/RELATORIO_AB_CLAUDECLAW.md`
- [confirmed] Tabela de ganhos com matriz esforço×retorno — `/home/nmaldaner/projetos/openpcbot/RELATORIO_AB_GANHOS.md`
- [confirmed] Arquitetura do second brain do openpcbot — `/home/nmaldaner/projetos/openpcbot/ARQUITETURA_SECOND_BRAIN.md`
- [confirmed] Análise de armazenamento/busca de conhecimento — `/home/nmaldaner/projetos/openpcbot/COMO_ARMAZENA_CONHECIMENTO.md`
- [confirmed] Roadmap de 5 melhorias na memória — `/home/nmaldaner/projetos/openpcbot/TODO_MEMORIA.md`
- [confirmed] Notify enviado via Telegram listando os 5 tópicos para o usuário decidir quais implementar (rodado via `/home/nmaldaner/projetos/openpcbot/scripts/notify.sh`)

## Proposed / attempted but not confirmed
- [unverified] Fix PT-BR no regex `SEMANTIC_SIGNALS` em `src/memory.ts:13` do openpcbot — tem proposta exata em `TODO_MEMORIA.md` (#1), mas NÃO foi aplicada. Aguarda resposta do usuário no Telegram.
- [unverified] Os outros 4 itens do roadmap (integração SQLite↔vault, embeddings, auto-injeção do vault, dedup semântica) também aguardam resposta.

## Key files for next session
- `/home/nmaldaner/projetos/openpcbot/TODO_MEMORIA.md` — ler primeiro: contém os 5 itens com fix proposto, esforço e dependências
- `/home/nmaldaner/projetos/openpcbot/COMO_ARMAZENA_CONHECIMENTO.md` — contexto técnico de como o sistema de memória funciona hoje
- `/home/nmaldaner/projetos/openpcbot/src/memory.ts` — arquivo a editar para item #1 (regex linha 13)
- `/home/nmaldaner/projetos/openpcbot/src/db.ts` — schema da tabela `memories` + FTS5 (linhas 32-45, 128-145)
- Plan file: none
- Memory files touched: none

## Running state
- Background processes: none
- Dev servers / ports: none (openpcbot roda como systemd user service em outro contexto, não foi iniciado nesta sessão)
- Open worktrees / branches: none — working tree do claudeclaw-os limpo, openpcbot não foi modificado em código

## Verification — how to confirm things still work
- `ls /home/nmaldaner/projetos/openpcbot/*.md` — deve listar os .md criados (RELATORIO_AB_CLAUDECLAW, RELATORIO_AB_GANHOS, ARQUITETURA_SECOND_BRAIN, COMO_ARMAZENA_CONHECIMENTO, TODO_MEMORIA, SESSION_HANDOFF_2026-05-04)
- `ls /home/nmaldaner/projetos/claudeclaw-os/docs/comparacao-openpcbot.md` — deve existir
- `git -C /home/nmaldaner/projetos/openpcbot status` — esperado: arquivos novos untracked, nenhum modificado em src/
- `git -C /home/nmaldaner/projetos/claudeclaw-os status` — esperado: 1 arquivo novo untracked em docs/

## Deferred + open questions
- Open: usuário precisa responder no Telegram quais dos 5 itens implementar. Mensagem foi enviada via `notify.sh` mas não há confirmação de leitura.
- Deferred: implementação dos itens 1-5 do `TODO_MEMORIA.md` — esperando decisão.
- Deferred: nenhuma alteração de código ainda no openpcbot (só documentação).

## Pick up here
Aguardar resposta do usuário no Telegram com números dos itens a implementar. Se ele responder "1", aplicar o fix de regex em `/home/nmaldaner/projetos/openpcbot/src/memory.ts:13` exatamente como está em `TODO_MEMORIA.md` #1, depois `npm run build` no projeto openpcbot, depois `systemctl --user restart openpcbot`. Se responder "3", começar pelo embeddings (depende dele para 4 e 5).
