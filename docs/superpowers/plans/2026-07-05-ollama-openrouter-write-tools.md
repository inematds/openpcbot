# Ollama + OpenRouter write-capable com gate de permissão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar shell completo (ler/escrever/rodar/git/rede) aos backends Ollama e OpenRouter do bot, com comandos graves pedindo permissão no Telegram (botão + sim/não) e um modo livre temporário.

**Architecture:** Um módulo compartilhado `src/agent-tools.ts` (tool `bash` full-shell + `classifyRisk` + `executeShell`) substitui o `bash` read-only. Em `src/bot.ts`, um `runToolCall` centraliza classificar→gate→executar; a permissão é uma promise resolvida por um handler de `callback_query` (botões) ou por `sim/não` em texto; `freeMode` pré-autoriza por janela.

**Tech Stack:** TypeScript (ESM, NodeNext), grammY (Telegram), vitest, Ollama HTTP, OpenRouter API.

## Global Constraints

- Vale só pros caminhos **Ollama** (`handleOllamaMessage`) e **OpenRouter** (`handleOpenrouterMessage`). Claude e Codex intactos.
- Zona segura de escrita: `/home/nmaldaner/projetos` (`SAFE_ROOT`). cwd do shell = `SAFE_ROOT`.
- Classificador é best-effort (parsing de string); ameaça = engano, não evasão.
- `executeShell`: timeout 300000ms, maxBuffer 4MB, saída capada em 16000 chars, nunca lança.
- `MAX_TOOL_ITERS` = 12 nos dois loops. Ollama mantém `think:false` e `keep_alive:'30m'`.
- Régua grave (pede permissão): apagar em massa (rm -r/-rf/rmdir/find -delete/shred/truncate/dd/mkfs), escrita/exec fora de `~/projetos`, sudo/su/pkexec, instalar sistema (apt/pip install/npm -g/snap/brew), matar processo/serviço (kill/pkill/systemctl stop|restart|start/reboot/shutdown), segredos (.env/token/secret/*.pem/id_rsa/cookies/~/.ssh/~/.config/auth.json). Auto = resto, incluindo `git push`, `curl POST`, `npm publish`, `gh`, build, escrita dentro de `~/projetos`.
- Após implementar: `npm run typecheck && npm run build`, depois `systemctl --user restart openpcbot` (serviço systemd de usuário — SEM sudo; ver CLAUDE.md "Como (re)startar o serviço").
- Commits frequentes, um por task. NÃO dar push (só quando o usuário pedir).

---

### Task 1: `classifyRisk` (classificador de risco) + testes

**Files:**
- Create: `src/agent-tools.ts`
- Test: `src/agent-tools.test.ts`

**Interfaces:**
- Produces: `classifyRisk(command: string): RiskVerdict` onde `interface RiskVerdict { level: 'auto' | 'grave'; reason?: string }`; e `const SAFE_ROOT = '/home/nmaldaner/projetos'`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/agent-tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyRisk } from './agent-tools.js';

describe('classifyRisk', () => {
  const grave = [
    'rm -rf /home/nmaldaner/projetos/x',
    'rm -r build',
    'rmdir foo',
    'find . -name "*.tmp" -delete',
    'sudo systemctl restart nginx',
    'apt install cowsay',
    'pip install requests',
    'npm install -g typescript',
    'kill -9 1234',
    'systemctl stop openpcbot',
    'reboot',
    'cat .env',
    'cat /home/nmaldaner/.ssh/id_rsa',
    'echo x > /etc/hosts',
    'truncate -s 0 log.txt',
    'dd if=/dev/zero of=disk.img',
  ];
  const auto = [
    'ls /home/nmaldaner/projetos',
    'cat /home/nmaldaner/projetos/openpcbot/package.json',
    'git push origin main',
    'curl -X POST https://api.exemplo.com -d @body.json',
    'npm run build',
    'npm publish',
    'mkdir -p /home/nmaldaner/projetos/novo',
    'echo "oi" > /home/nmaldaner/projetos/openpcbot/nota.txt',
    'grep -r TODO /home/nmaldaner/projetos/openpcbot/src',
    'gh pr create',
  ];

  for (const cmd of grave) {
    it(`grave: ${cmd}`, () => expect(classifyRisk(cmd).level).toBe('grave'));
  }
  for (const cmd of auto) {
    it(`auto: ${cmd}`, () => expect(classifyRisk(cmd).level).toBe('auto'));
  }

  it('inclui um motivo nos graves', () => {
    expect(classifyRisk('sudo rm -rf /').reason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/agent-tools.test.ts`
Expected: FAIL (`Cannot find module './agent-tools.js'` / `classifyRisk is not a function`).

- [ ] **Step 3: Implementar `classifyRisk`**

Create `src/agent-tools.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';
import type { OpenRouterTool } from './openrouter.js';

const execFileAsync = promisify(execFile);

/** Zona segura de escrita. Escrita/exec fora daqui é considerada grave. */
export const SAFE_ROOT = '/home/nmaldaner/projetos';

export interface RiskVerdict {
  level: 'auto' | 'grave';
  reason?: string;
}

/** Regras que marcam um comando como grave. Best-effort (string matching). */
const GRAVE_RULES: Array<{ re: RegExp; reason: string }> = [
  { re: /(^|[\s|;&(])(sudo|doas|pkexec)\s/, reason: 'privilégio (sudo)' },
  { re: /(^|[\s|;&(])su\s/, reason: 'privilégio (su)' },
  { re: /(^|[\s|;&(])(apt|apt-get|dpkg|snap)\s/, reason: 'pacote de sistema' },
  { re: /(^|[\s|;&(])brew\s+(install|upgrade|reinstall)/, reason: 'brew install' },
  { re: /(^|[\s|;&(])pip3?\s+install/, reason: 'pip install' },
  { re: /(^|[\s|;&(])npm\s+(i|install|add)\b[^\n]*(-g|--global)/, reason: 'npm install global' },
  { re: /(^|[\s|;&(])(pnpm\s+add|yarn\s+global\s+add)[^\n]*(-g|--global|global)/, reason: 'pacote global' },
  { re: /(^|[\s|;&(])rm\s+-\w*[rR]/, reason: 'delete recursivo (rm -r)' },
  { re: /(^|[\s|;&(])rm\b[^\n]*\*/, reason: 'delete com wildcard (rm *)' },
  { re: /(^|[\s|;&(])rmdir\s/, reason: 'remover diretório' },
  { re: /(^|[\s|;&(])(shred|mkfs)\s/, reason: 'destruição de dados' },
  { re: /(^|[\s|;&(])truncate\s/, reason: 'truncar arquivo' },
  { re: /(^|[\s|;&(])dd\s/, reason: 'dd (escrita bruta)' },
  { re: /(^|[\s|;&(])find\b[^\n]*-delete/, reason: 'find -delete' },
  { re: /(^|[\s|;&(])(kill|pkill|killall)\s/, reason: 'matar processo' },
  { re: /(^|[\s|;&(])systemctl\s+(stop|restart|start|disable|kill|mask)/, reason: 'controle de serviço' },
  { re: /(^|[\s|;&(])service\s+\S+\s+(stop|restart|start)/, reason: 'controle de serviço' },
  { re: /(^|[\s|;&(])(reboot|shutdown|halt|poweroff)\b/, reason: 'desligar/reiniciar' },
  { re: /(^|[\s|;&(])chmod\s+-\w*R/, reason: 'chmod recursivo' },
  { re: /(^|[\s|;&(])chown\s+-\w*R/, reason: 'chown recursivo' },
];

/** Referência a segredos/arquivos sensíveis (ler OU escrever). */
const SENSITIVE_RE = /(\.env\b|\/\.ssh(\/|\b)|id_rsa|id_ed25519|\.pem\b|credentials|secret|token|cookies|auth\.json|\/\.aws(\/|\b)|\/\.config\/)/i;

/** Verbos/operadores que mutam o sistema de arquivos. */
const MUTATING_RE = /(^|[\s|;&(])(rm|mv|cp|tee|dd|ln|chmod|chown)\s|>>?/;

/** true se o comando referencia algum path absoluto/home fora de SAFE_ROOT. */
function referencesPathOutsideSafeRoot(cmd: string): boolean {
  const tokens = cmd.match(/(?:~|\$HOME|\/)[^\s'"|;&<>()]*/g) || [];
  for (const raw of tokens) {
    const p = raw.replace(/^~/, '/home/nmaldaner').replace(/^\$HOME/, '/home/nmaldaner');
    if (!p.startsWith('/')) continue;
    if (p !== SAFE_ROOT && !p.startsWith(SAFE_ROOT + '/')) return true;
  }
  return false;
}

export function classifyRisk(command: string): RiskVerdict {
  const cmd = command.trim();

  for (const rule of GRAVE_RULES) {
    if (rule.re.test(cmd)) return { level: 'grave', reason: rule.reason };
  }
  if (SENSITIVE_RE.test(cmd)) return { level: 'grave', reason: 'segredo/arquivo sensível' };
  if (MUTATING_RE.test(cmd) && referencesPathOutsideSafeRoot(cmd)) {
    return { level: 'grave', reason: 'escrita fora de ~/projetos' };
  }
  return { level: 'auto' };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/agent-tools.test.ts`
Expected: PASS (todos os casos grave/auto).

- [ ] **Step 5: Commit**

```bash
git add src/agent-tools.ts src/agent-tools.test.ts
git commit -m "feat(agent-tools): classificador de risco de comando (grave/auto)"
```

---

### Task 2: `executeShell` + `AGENT_TOOLS`

**Files:**
- Modify: `src/agent-tools.ts` (append)
- Test: `src/agent-tools.test.ts` (append)

**Interfaces:**
- Consumes: `SAFE_ROOT` (Task 1).
- Produces: `executeShell(command: string, opts?: { timeoutMs?: number; cwd?: string; maxOutput?: number }): Promise<string>`; `const AGENT_TOOLS: OpenRouterTool[]` (um tool `bash`).

- [ ] **Step 1: Escrever os testes que falham**

Append to `src/agent-tools.test.ts`:

```ts
import { executeShell, AGENT_TOOLS } from './agent-tools.js';

describe('executeShell', () => {
  it('roda comando e devolve stdout', async () => {
    const out = await executeShell('echo ola-mundo');
    expect(out).toContain('ola-mundo');
  });
  it('não lança em comando que falha; devolve texto de erro', async () => {
    const out = await executeShell('ls /caminho/que/nao/existe/xyz');
    expect(out.toLowerCase()).toContain('error');
  });
});

describe('AGENT_TOOLS', () => {
  it('expõe um tool bash', () => {
    expect(AGENT_TOOLS[0].function.name).toBe('bash');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/agent-tools.test.ts`
Expected: FAIL (`executeShell`/`AGENT_TOOLS` não exportados).

- [ ] **Step 3: Implementar `executeShell` e `AGENT_TOOLS`**

Append to `src/agent-tools.ts`:

```ts
const MAX_OUTPUT_CHARS = 16000;

/**
 * Roda um comando no shell da máquina (full shell, sem guard). Nunca lança:
 * falhas voltam como texto pro modelo. Saída capada. cwd = SAFE_ROOT.
 */
export async function executeShell(
  command: string,
  opts?: { timeoutMs?: number; cwd?: string; maxOutput?: number },
): Promise<string> {
  const timeout = opts?.timeoutMs ?? 300_000;
  const cwd = opts?.cwd ?? SAFE_ROOT;
  const cap = opts?.maxOutput ?? MAX_OUTPUT_CHARS;
  const trunc = (s: string) => (s.length > cap ? s.slice(0, cap) + '\n... (truncado)' : s);
  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      cwd,
    });
    logger.info({ command }, 'agent shell ran');
    return trunc((stdout || stderr || '(sem saída)').toString());
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
    if (e.killed) return 'error: comando expirou (300s)';
    return `error: ${trunc((e.stderr || e.stdout || e.message || 'comando falhou').toString())}`;
  }
}

/**
 * Tool exposta aos modelos Ollama/OpenRouter. Full shell — o gate de risco vive
 * no chamador (runToolCall em bot.ts), não aqui.
 */
export const AGENT_TOOLS: OpenRouterTool[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Run a shell command on the host to inspect OR modify files, run git/npm/builds, or use the network. ' +
        'You operate under /home/nmaldaner/projetos. Just run what the task needs — dangerous commands ' +
        '(mass delete, sudo, installing system packages, killing processes, touching secrets, or writing outside ~/projetos) ' +
        'automatically prompt the user for permission before running. Use absolute paths under /home/nmaldaner/projetos.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to run.' },
        },
        required: ['command'],
      },
    },
  },
];
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/agent-tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent-tools.ts src/agent-tools.test.ts
git commit -m "feat(agent-tools): executeShell full-shell + AGENT_TOOLS"
```

---

### Task 3: Núcleo do gate em bot.ts (estado, askPermission, runToolCall)

**Files:**
- Modify: `src/bot.ts` (imports; adicionar bloco de estado + funções perto dos outros `Map` de estado por chat, ex.: logo após `const chatOpenrouterModel = new Map...`)

**Interfaces:**
- Consumes: `classifyRisk`, `executeShell`, `AGENT_TOOLS` (Tasks 1-2).
- Produces: `isFreeMode(chatId: string): boolean`; `setFreeMode(chatId: string, ms: number): void`; `clearFreeMode(chatId: string): void`; `freeModeRemainingMs(chatId: string): number`; `resolvePermission(chatId: string, allowed: boolean): boolean`; `runToolCall(ctx: Context, chatId: string, toolName: string, command: string): Promise<string>`; e os `Map` `freeMode`, `pendingPermission`.

- [ ] **Step 1: Adicionar imports em `src/bot.ts`**

**Adicionar** (sem remover a import read-only ainda — os loops só migram nas Tasks 6-7; a import antiga é removida na Task 7). Após a linha `import { OPENROUTER_TOOLS, executeOpenRouterTool } from './openrouter-tools.js';`, inserir:

```ts
import { AGENT_TOOLS, classifyRisk, executeShell } from './agent-tools.js';
```

Garantir que `InlineKeyboard` esteja importado do grammy. Localizar a import do grammy (ex.: `import { Bot, Context, ... } from 'grammy';`) e adicionar `InlineKeyboard` à lista se ainda não estiver.

- [ ] **Step 2: Adicionar estado + funções do gate**

Logo após a linha `const chatOpenrouterModel = new Map<string, string>();` (bloco de estado por chat), inserir:

```ts
// ── Gate de permissão para tools com escrita (Ollama/OpenRouter) ──────────────
// Modo livre: pré-autoriza comandos graves por uma janela de tempo (por chat).
const freeMode = new Map<string, number>(); // chatId -> expiry epoch ms
// Permissão pendente: promise resolvida por botão inline ou por "sim/não".
interface PendingPerm { resolve: (allowed: boolean) => void; command: string; timer: NodeJS.Timeout; }
const pendingPermission = new Map<string, PendingPerm>();
const PERM_TIMEOUT_MS = 180_000;

function isFreeMode(chatId: string): boolean {
  const exp = freeMode.get(chatId);
  if (!exp) return false;
  if (Date.now() > exp) { freeMode.delete(chatId); return false; }
  return true;
}
function setFreeMode(chatId: string, ms: number): void { freeMode.set(chatId, Date.now() + ms); }
function clearFreeMode(chatId: string): void { freeMode.delete(chatId); }
function freeModeRemainingMs(chatId: string): number {
  const exp = freeMode.get(chatId);
  return exp && exp > Date.now() ? exp - Date.now() : 0;
}

/** Resolve uma permissão pendente (via botão ou texto). Retorna false se não havia nenhuma. */
function resolvePermission(chatId: string, allowed: boolean): boolean {
  const p = pendingPermission.get(chatId);
  if (!p) return false;
  clearTimeout(p.timer);
  pendingPermission.delete(chatId);
  p.resolve(allowed);
  return true;
}

/** Pausa e pede permissão ao usuário (botão + aceita sim/não). Timeout => nega. */
async function askPermission(ctx: Context, chatId: string, command: string, reason?: string): Promise<boolean> {
  if (pendingPermission.has(chatId)) return false; // já há uma pendente; nega defensivamente
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const shown = command.length > 300 ? command.slice(0, 300) + '…' : command;
  const kb = new InlineKeyboard().text('Permitir ✅', 'perm:allow').text('Negar ❌', 'perm:deny');
  await ctx.reply(
    `🔒 Comando grave${reason ? ` (${reason})` : ''}:\n<code>${esc(shown)}</code>\n\nPermitir? (ou responda sim/não)`,
    { parse_mode: 'HTML', reply_markup: kb },
  );
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingPermission.delete(chatId);
      resolve(false);
      void ctx.reply('⏱️ Sem resposta em 3min — comando negado.');
    }, PERM_TIMEOUT_MS);
    pendingPermission.set(chatId, { resolve, command, timer });
  });
}

/** Classifica → (gate se grave) → executa. Ecoa o comando no chat. Usado pelos dois loops. */
async function runToolCall(ctx: Context, chatId: string, toolName: string, command: string): Promise<string> {
  if (toolName !== 'bash') return `error: unknown tool "${toolName}"`;
  if (!command.trim()) return 'error: comando vazio';
  const risk = classifyRisk(command);
  const shown = command.length > 300 ? command.slice(0, 300) + '…' : command;

  if (risk.level === 'auto' || isFreeMode(chatId)) {
    await ctx.reply(`${risk.level === 'grave' ? '🔓' : '🔧'} ${shown}`);
    return executeShell(command);
  }
  const allowed = await askPermission(ctx, chatId, command, risk.reason);
  if (!allowed) return 'blocked: usuário negou permissão';
  await ctx.reply('▶️ rodando...');
  return executeShell(command);
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npm run typecheck`
Expected: PASS (0 erros). `noUnusedLocals` não está ligado no projeto, então `AGENT_TOOLS`/`classifyRisk`/`executeShell`/`runToolCall` ainda não usados não quebram (serão consumidos nas Tasks 6-7). A import antiga `OPENROUTER_TOOLS/executeOpenRouterTool` continua presente e usada pelos loops até a Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): núcleo do gate de permissão (askPermission, runToolCall, modo livre)"
```

---

### Task 4: Resolver permissão — handler de botão + guarda de sim/não

**Files:**
- Modify: `src/bot.ts` (registrar handler `callback_query:data`; guarda no início de `bot.on('message:text', ...)`)

**Interfaces:**
- Consumes: `resolvePermission`, `pendingPermission` (Task 3).

- [ ] **Step 1: Handler dos botões inline**

Perto de onde os outros `bot.on(...)` são registrados (ex.: logo antes de `bot.on('message:text', ...)`), adicionar. Se já existir um `bot.on('callback_query:data', ...)`, adicione o bloco `if (data.startsWith('perm:'))` no topo dele em vez de criar outro.

```ts
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (data === 'perm:allow' || data === 'perm:deny') {
    const chatId = (ctx.chat?.id ?? ctx.callbackQuery.from.id).toString();
    const had = resolvePermission(chatId, data === 'perm:allow');
    await ctx.answerCallbackQuery(had ? (data === 'perm:allow' ? 'Permitido' : 'Negado') : 'Nada pendente');
    try { await ctx.editMessageReplyMarkup(); } catch { /* mensagem antiga, ignora */ }
    return;
  }
});
```

- [ ] **Step 2: Guarda de sim/não no início do handler de texto**

Localizar o começo do corpo de `bot.on('message:text', async (ctx) => {` e, como **primeira** lógica (após obter `chatIdStr`; se `chatIdStr` ainda não existir ali, derive `const chatIdStr = ctx.chat.id.toString();` no topo), inserir:

```ts
    // Se há uma permissão pendente, "sim/não" resolve ela (não vira mensagem nova).
    if (pendingPermission.has(chatIdStr)) {
      const t = (ctx.message.text || '').trim().toLowerCase();
      if (/^(sim|s|yes|y|nao|não|n|no)$/.test(t)) {
        resolvePermission(chatIdStr, /^(sim|s|yes|y)$/.test(t));
        return;
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 erros).

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): resolver permissão via botão inline e sim/não"
```

---

### Task 5: Comando `/livre` (modo livre) + registro

**Files:**
- Modify: `src/bot.ts` (branch de comando `/livre`; adicionar à lista de `setMyCommands`)

**Interfaces:**
- Consumes: `setFreeMode`, `clearFreeMode`, `freeModeRemainingMs` (Task 3).

- [ ] **Step 1: Adicionar o comando**

Junto dos outros branches de comando dentro do handler de texto (perto do tratamento de `/ollama`, `/openrouter`), adicionar. Colocar ANTES do roteamento final para não cair no agente.

```ts
    if (text === '/livre' || text.startsWith('/livre ') || text.startsWith('/livre@')) {
      const arg = text.replace(/^\/livre(@\S+)?/, '').trim().toLowerCase();
      if (arg === 'off') {
        clearFreeMode(chatIdStr);
        await ctx.reply('Modo livre desligado. Comandos graves voltam a pedir permissão.');
        return;
      }
      if (!arg || arg === 'status') {
        const ms = freeModeRemainingMs(chatIdStr);
        await ctx.reply(ms > 0
          ? `🔓 Modo livre LIGADO — ~${Math.ceil(ms / 60000)}min restantes. Graves rodam sem pedir.`
          : 'Modo livre desligado. Use /livre 30m pra ligar por 30 minutos.');
        return;
      }
      const m = arg.match(/^(\d+)\s*(m|min|h)?$/);
      const n = m ? parseInt(m[1], 10) : 30;
      const ms = (m?.[2] === 'h' ? n * 60 : n) * 60_000;
      setFreeMode(chatIdStr, ms);
      await ctx.reply(`🔓 Modo livre LIGADO por ${m?.[2] === 'h' ? n + 'h' : n + 'min'}. Graves rodam sem pedir. /livre off pra desligar.`);
      return;
    }
```

- [ ] **Step 2: Registrar na lista de comandos**

Localizar o array passado a `setMyCommands` (contém `{ command: 'model', ... }`, `{ command: 'stop', ... }`) e adicionar:

```ts
    { command: 'livre', description: 'Modo livre: pré-autoriza comandos graves por um tempo' },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 erros).

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(bot): comando /livre (modo livre temporário)"
```

---

### Task 6: Ligar o loop do Ollama ao novo tool + gate

**Files:**
- Modify: `src/bot.ts` (`handleOllamaMessage`, `ollamaSystemPrompt`)

**Interfaces:**
- Consumes: `AGENT_TOOLS`, `runToolCall`.

- [ ] **Step 1: Trocar o tool e a execução no loop**

Em `handleOllamaMessage`, localizar:

```ts
    const tools = OPENROUTER_TOOLS as unknown as OllamaTool[];
```
Substituir por:
```ts
    const tools = AGENT_TOOLS as unknown as OllamaTool[];
```

Localizar o bloco de execução das tool calls:

```ts
      messages.push({ role: 'assistant', content: result.content || '', tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        const argsObj = tc.function.arguments ?? {};
        const display = (argsObj as { command?: string }).command ?? JSON.stringify(argsObj);
        await ctx.reply(`🔧 ${tc.function.name}: ${String(display).slice(0, 300)}`);
        // Ollama returns arguments as an object; the executor expects a JSON string.
        const toolResult = await executeOpenRouterTool(tc.function.name, JSON.stringify(argsObj));
        messages.push({ role: 'tool', tool_name: tc.function.name, content: toolResult });
      }
```
Substituir por:
```ts
      messages.push({ role: 'assistant', content: result.content || '', tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        const argsObj = tc.function.arguments ?? {};
        const command = String((argsObj as { command?: string }).command ?? '');
        const toolResult = await runToolCall(ctx, chatIdStr, tc.function.name, command);
        messages.push({ role: 'tool', tool_name: tc.function.name, content: toolResult });
      }
```

Localizar `const MAX_TOOL_ITERS = 8;` dentro de `handleOllamaMessage` e trocar para `const MAX_TOOL_ITERS = 12;`.

- [ ] **Step 2: Atualizar o `ollamaSystemPrompt`**

Substituir o corpo de `ollamaSystemPrompt` por:

```ts
function ollamaSystemPrompt(model: string): string {
  return [
    'You are a helpful assistant running inside OpenPCBot, a multi-agent Telegram bot.',
    `You are powered by the local model "${model}", served via Ollama on the user's own machine.`,
    'If asked which model or AI you are, answer truthfully with that model name. Do NOT claim to be ChatGPT or made by OpenAI.',
    '',
    'You have a `bash` tool with a FULL shell: you can read AND write files, run git/npm/builds, and use the network. You operate under /home/nmaldaner/projetos — use absolute paths there.',
    'Just run what the task needs. Dangerous commands (mass delete, sudo, installing system packages, killing processes, touching secrets, or writing outside ~/projetos) will automatically ask the user for permission — so try, the gate handles safety.',
    'Do not narrate that you are about to call a tool. Just call it, then answer concisely.',
    'All user projects live in /home/nmaldaner/projetos/.',
  ].join('\n');
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS (0 erros). O loop do Ollama já usa `AGENT_TOOLS`/`runToolCall`; o OpenRouter ainda usa a tool antiga (removida na Task 7), que continua importada — sem erro de tipo.

- [ ] **Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat(ollama): loop agêntico com escrita + gate de permissão"
```

---

### Task 7: Ligar o loop do OpenRouter + remover tool read-only + verificação final

**Files:**
- Modify: `src/bot.ts` (`handleOpenrouterMessage`, `openrouterSystemPrompt`)
- Delete: `src/openrouter-tools.ts`, `src/openrouter-tools.test.ts`

**Interfaces:**
- Consumes: `AGENT_TOOLS`, `runToolCall`.

- [ ] **Step 1: Trocar tool e execução no loop do OpenRouter**

Em `handleOpenrouterMessage`, localizar `const MAX_TOOL_ITERS = 8;` e trocar para `const MAX_TOOL_ITERS = 12;`.

Localizar:
```ts
      const result = await openrouterChat(model, messages, { tools: OPENROUTER_TOOLS });
```
Substituir por:
```ts
      const result = await openrouterChat(model, messages, { tools: AGENT_TOOLS });
```

Localizar o bloco:
```ts
      messages.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        let display = tc.function.arguments;
        try { display = JSON.parse(tc.function.arguments).command ?? display; } catch { /* keep raw */ }
        await ctx.reply(`🔧 ${tc.function.name}: ${String(display).slice(0, 300)}`);
        const toolResult = await executeOpenRouterTool(tc.function.name, tc.function.arguments);
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolResult });
      }
```
Substituir por:
```ts
      messages.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls });
      for (const tc of result.toolCalls) {
        let command = '';
        try { command = String(JSON.parse(tc.function.arguments).command ?? ''); } catch { command = ''; }
        const toolResult = await runToolCall(ctx, chatIdStr, tc.function.name, command);
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolResult });
      }
```

- [ ] **Step 2: Atualizar o `openrouterSystemPrompt`**

Localizar a linha do prompt sobre o bash read-only:
```ts
    'You have a single `bash` tool for READ-ONLY inspection of this machine (ls, cat, grep, find, git read-only, ps, df, etc). Use it when the user asks about files, projects, or system state. Use absolute paths like /home/nmaldaner/projetos/<name> to look at other projects.',
```
Substituir por:
```ts
    'You have a `bash` tool with a FULL shell: read AND write files, run git/npm/builds, use the network. You operate under /home/nmaldaner/projetos — use absolute paths there. Just run what the task needs; dangerous commands (mass delete, sudo, system installs, killing processes, secrets, or writing outside ~/projetos) will ask the user for permission automatically.',
```
Se houver, na sequência do prompt, uma linha dizendo que ele NÃO pode escrever/usar rede ("You CANNOT write/delete files, run builds, install things, or use the network. For anything that mutates..."), removê-la ou reduzi-la para: `'For heavy multi-step coding, you may suggest the user use /claude (Claude Code) or /codex (Codex CLI).'`.

- [ ] **Step 3: Remover a tool read-only obsoleta**

Remover a import agora órfã em `src/bot.ts`:
```ts
import { OPENROUTER_TOOLS, executeOpenRouterTool } from './openrouter-tools.js';
```
Depois remover os arquivos:
```bash
git rm src/openrouter-tools.ts src/openrouter-tools.test.ts
```
Conferir que não sobrou referência:
Run: `grep -rn "openrouter-tools\|OPENROUTER_TOOLS\|executeOpenRouterTool" src/`
Expected: nenhuma linha (0 resultados).

- [ ] **Step 4: Typecheck + build + testes**

Run: `npm run typecheck && npm run build && npx vitest run`
Expected: tudo PASS. 0 erros de tipo; testes do `agent-tools` verdes; nenhum teste quebrado por referência ao módulo removido.

- [ ] **Step 5: Commit** (adicionar por caminho explícito — NÃO usar `git add -A`, o working tree tem arquivos não relacionados)

```bash
git add src/bot.ts src/openrouter-tools.ts src/openrouter-tools.test.ts
git commit -m "feat(openrouter): loop com escrita + gate; remove tool read-only obsoleta"
```

- [ ] **Step 6: Reiniciar o serviço e validar manualmente**

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user restart openpcbot
systemctl --user is-active openpcbot
```
Validação manual no Telegram (roteiro):
1. `/ollama escreve "oi" em /home/nmaldaner/projetos/openpcbot/scratch_teste.txt` → roda direto (🔧), cria o arquivo.
2. `/ollama apaga a pasta /home/nmaldaner/projetos/openpcbot/scratch_teste_dir com rm -rf` → aparece 🔒 com botões; testar **Negar** (modelo recebe "negou") e depois **Permitir**.
3. Responder `sim`/`não` em texto em vez de botão — deve resolver igual.
4. `/livre 10m` depois um comando grave → roda com 🔓 sem perguntar. `/livre off` volta a pedir.
5. Repetir 1-2 com `/openrouter` (sticky) pra confirmar paridade.

---

## Self-Review (feita)

- **Cobertura da spec:** módulo compartilhado (T1-T2) ✓; classifyRisk com a régua fechada (T1) ✓; executeShell/limites (T2) ✓; gate A+B+C — botão (T4), sim/não (T4), modo livre (T3+T5) ✓; guarda no message:text (T4) ✓; prompts reescritos (T6-T7) ✓; MAX_TOOL_ITERS 12 (T6-T7) ✓; isolamento (só Ollama/OpenRouter; Codex/Claude intactos) ✓; testes classifyRisk (T1) + roteiro manual (T7) ✓; restart user-service (T7) ✓.
- **Placeholders:** nenhum "TBD/TODO"; todo passo tem código real.
- **Consistência de tipos:** `runToolCall(ctx, chatId, toolName, command)`, `classifyRisk→RiskVerdict`, `executeShell(command, opts)`, `AGENT_TOOLS: OpenRouterTool[]` usados igual em T3/T6/T7. Ollama passa `arguments` (objeto) → extrai `.command`; OpenRouter faz `JSON.parse(arguments).command`. `resolvePermission`/`pendingPermission` usados em T3/T4 com mesma assinatura.
- **Ordem:** T3→T6→T7 precisam rodar antes do typecheck ficar verde (a import read-only some em T3 mas os loops só migram em T6/T7). Ressalva anotada nos passos.
