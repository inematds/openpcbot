# Design — Ollama + OpenRouter write-capable com gate de permissão via Telegram

- **Data:** 2026-07-05
- **Status:** aprovado (design), aguardando revisão da spec
- **Branch alvo:** a definir (a partir de `refactor/mkivideos-thin-client` / `main`)

## Objetivo

Dar aos backends **Ollama** (qwen3.6:35b-a3b) e **OpenRouter** (GLM-5.2 etc.) shell completo (ler, escrever, rodar comandos, git, npm, rede) — não mais só o `bash` read-only atual. Comandos considerados **graves** pausam e pedem permissão ao usuário no Telegram (botão inline + `sim/não` em texto); um **modo livre** temporário pré-autoriza tudo numa janela.

Motivação: quando o Claude cai, o usuário quer um agente que **execute** (não só responda). O Ollama entrega isso local/offline/grátis; o OpenRouter entrega com variedade de modelo. O gate dá controle que o Codex (caixa-preta, não-interativo) não oferece.

## Escopo

- **Inclui:** caminho Ollama (`handleOllamaMessage`) e caminho OpenRouter (`handleOpenrouterMessage`) em `src/bot.ts`.
- **Não inclui:** Claude (Agent SDK, já tem ferramentas próprias) e Codex (`codex exec --full-auto` é caixa-preta com sandbox próprio; não dá pra interceptar comando a comando pra um gate externo). Sem sandbox OS-level. Sem mexer no router.

## Modelo de ameaça

Modelo **cooperativo mas falível** (local ou cloud) que **quer** a permissão nos graves — não um adversário tentando evadir. O gate é rede de segurança contra **engano**, não sandbox contra evasão. Logo o classificador de risco é **best-effort** (parsing de string): pega os padrões graves óbvios; um comando pode esconder perigo dentro de script/subprocesso e escapar. Aceito conscientemente. Ressalva extra no OpenRouter: modelo remoto → risco de **prompt-injection** (conteúdo buscado por `curl` instruindo o modelo). O gate cobre os graves; o resíduo é aceito.

## Arquitetura

### Novo módulo compartilhado: `src/agent-tools.ts`

Substitui, para os dois loops, o `OPENROUTER_TOOLS`/`executeOpenRouterTool` read-only (`src/openrouter-tools.ts`). Exporta:

- `AGENT_TOOLS`: um único tool `bash`, descrição = "shell completo (ler/escrever/rodar/git/npm/rede) sob ~/projetos; comandos graves pedem permissão ao usuário".
- `classifyRisk(command: string): { level: 'auto' | 'grave'; reason?: string }` — regras determinísticas abaixo.
- `executeShell(command: string, opts?): Promise<string>` — roda `bash -c` **sem guard** (full shell). `timeout` default **300000ms (5 min)**, `maxBuffer` 4MB, `cwd` = `/home/nmaldaner/projetos`. Nunca lança: erro vira texto. Saída capada em ~16000 chars (trunca com aviso).

Formato do tool é compatível com Ollama (`OllamaTool`) e OpenRouter (`OpenRouterTool`) — mesma forma JSON, cast no ponto de uso como já é feito hoje.

O `src/openrouter-tools.ts` read-only e seu teste ficam obsoletos: remover após migração (ou manter só o teste do guard como referência histórica — decisão na implementação).

### Classificador `classifyRisk`

Retorna `grave` (com `reason`) se **qualquer** regra casar; senão `auto`.

**Grave:**
1. **Apagar/sobrescrever em massa:** `rm -r`, `rm -rf`, `rm ` de diretório, `rmdir`, `find ... -delete`, `shred`, `truncate`, `dd`, `mkfs`, `> /dev/sd`, `chmod -R`, `chown -R`.
2. **Fora de `~/projetos`:** comando com verbo mutante (`rm|mv|cp|tee|dd|ln|chmod|chown|>|>>`) mirando path absoluto que **não** resolve sob `/home/nmaldaner/projetos`; ou referência a paths sensíveis (`/etc`, `~/.ssh`, `~/.config`, `~/.aws`, `/home/nmaldaner/.<dotfile>`).
3. **Privilégio:** `sudo`, `su `, `pkexec`, `doas`.
4. **Instalar/atualizar sistema:** `apt`, `apt-get`, `dpkg`, `pip install`, `pip3 install`, `npm i -g`/`npm install -g`, `pnpm add -g`, `yarn global`, `snap install`, `brew install`.
5. **Processo/serviço:** `kill`, `pkill`, `killall`, `systemctl stop|restart|disable|start`, `service `, `reboot`, `shutdown`, `halt`.
6. **Segredos (ler ou escrever):** tokens em `.env`, `credentials`, `secret`, `token`, `*.pem`, `id_rsa`, `id_ed25519`, `cookies`, `~/.ssh`, `~/.config/*/token*`, `auth.json`.

**Auto (tudo o resto):** leituras; criar/editar/mover arquivo **dentro de `~/projetos`**; `git add/commit/push`, `curl` (GET **e** POST), `gh`, `npm publish`, deploy, `npm run build|test`, `mkdir`, scripts locais.

Unidade crítica de segurança → coberta por testes unitários.

### Fluxo de permissão (A + B + C)

Estado (em memória, por chat, reseta no restart):
- `freeMode: Map<chatId, number>` (expiry epoch ms). `isFreeMode(chatId)` = agora < expiry.
- `pendingPermission: Map<chatId, { resolve: (allowed:boolean)=>void; command: string; timer }>`.

`askPermission(ctx, chatId, command, reason): Promise<boolean>`:
1. Envia mensagem `🔒 quer rodar (grave: <reason>):\n<cmd>\nPermitir?` com teclado inline `[Permitir ✅ (perm:allow) | Negar ❌ (perm:deny)]`.
2. Retorna promise; guarda `resolve` + timer de **180s** que resolve `false` e edita a msg pra "⏱️ expirou (negado)".

Resolução (dois caminhos):
- **Callback:** `bot.on('callback_query:data')` — se `data` começa com `perm:`, acha o pending do chat, resolve, limpa timer, `answerCallbackQuery`, edita a msg mostrando a decisão.
- **Texto:** no topo de `bot.on('message:text')` — se há pending pro chat e o texto casa `^(sim|s|yes|y|nao|não|n|no)$` (case-insensitive), resolve e **retorna** (não vira mensagem nova).

No loop (Ollama e OpenRouter), por tool call:
```
const risk = classifyRisk(cmd)
let allowed = risk.level === 'auto' || isFreeMode(chatId)
if (!allowed) allowed = await askPermission(ctx, chatId, cmd, risk.reason)
echo no chat: 🔧 bash: <cmd>   (🔓 se rodou por modo livre; 🔒 negado se negou)
tool result = allowed ? await executeShell(cmd) : 'blocked: usuário negou permissão'
```

**Modo livre:** comando neutro `/livre [Nm|Nh]` (default 30m; alias `/ollama livre` aceito) seta `freeMode` expiry; `/livre off` limpa; sem arg mostra status/tempo restante. Registrar `/livre` na lista de comandos do bot. Graves rodam sem perguntar na janela (ecoados com `🔓`). Estado por chat, não por backend — vale pra Ollama e OpenRouter.

**Dependência:** os handlers pesados já rodam fire-and-forget (`handler(...).catch(...)` sem `await`) no `message:text`, então o grammY processa o `callback_query`/`sim` enquanto o loop está pausado no `await askPermission`. Manter esse padrão.

### Prompt do sistema

Reescrever `ollamaSystemPrompt` e `openrouterSystemPrompt`: agora têm **shell completo** (ler/escrever/rodar/git/rede) sob `~/projetos`; comandos graves pedem permissão automaticamente, então é só tentar — o gate cuida da segurança. Remover o "você não pode escrever / use /claude".

### Limites

- `executeShell` timeout 300s, saída ~16KB truncada.
- `MAX_TOOL_ITERS` 8 → **12** (tarefas multi-passo).
- Ollama mantém `keep_alive: 30m` e `think: false`.

## Fluxo de dados (exemplo grave)

1. Usuário: "apaga a pasta renders/ do humanoides". 2. qwen chama `bash rm -rf renders`. 3. `classifyRisk` → grave (rm -rf). 4. Fora do modo livre → `askPermission` manda botão. 5. Usuário toca Permitir. 6. `callback_query` resolve `true`. 7. `executeShell` roda. 8. Resultado volta pro modelo, que responde. Se negasse → modelo recebe "blocked" e se adapta.

## Tratamento de erro

- `executeShell` nunca lança (erro → texto pro modelo).
- Timeout de permissão (180s) → nega.
- Comando com timeout (300s) → texto "command timed out".
- Erro no loop → mesma captura atual (`try/catch` do handler, reply de erro).

## Testes

- **Unit `classifyRisk`** (`src/agent-tools.test.ts`): matriz grave vs auto (rm -rf, sudo, apt, path fora de ~/projetos, .env, systemctl → grave; git push, curl POST, escrita em ~/projetos, npm build → auto). É a peça crítica.
- **Manual:** escrita em ~/projetos (roda direto); `rm -rf` (pede, botão + `sim`); `/ollama livre 30m` (não pergunta na janela); negar (modelo recebe blocked); testar nos dois backends.
- Após implementar: `npm run typecheck && npm run build`, depois `systemctl --user restart openpcbot` (ver CLAUDE.md — serviço user, sem sudo).

## Não-objetivos

Sandbox OS-level; gate no Codex; mexer no router/Claude; persistir estado de permissão entre restarts.
