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
  { re: /(^|[\s|;&(])pipx\s+install/, reason: 'pipx install' },
  { re: /(^|[\s|;&(])npm\s+(i|install|add)\b[^\n]*(-g|--global)/, reason: 'npm install global' },
  { re: /(^|[\s|;&(])(pnpm\s+add|yarn\s+global\s+add)[^\n]*(-g|--global|global)/, reason: 'pacote global' },
  { re: /(^|[\s|;&(])rm\s+(-\w*[rR]|--recursive)/, reason: 'delete recursivo (rm -r)' },
  { re: /(^|[\s|;&(])rm\b[^\n]*\*/, reason: 'delete com wildcard (rm *)' },
  { re: /(^|[\s|;&(])rmdir\s/, reason: 'remover diretório' },
  { re: /(^|[\s|;&(])(shred|mkfs)\s/, reason: 'destruição de dados' },
  { re: /(^|[\s|;&(])truncate\s/, reason: 'truncar arquivo' },
  { re: /(^|[\s|;&(])dd\s/, reason: 'dd (escrita bruta)' },
  { re: /(^|[\s|;&(])find\b[^\n]*-delete/, reason: 'find -delete' },
  { re: /(^|[\s|;&(])(kill|pkill|killall)\s/, reason: 'matar processo' },
  { re: /(^|[\s|;&(])systemctl(\s+--?\S+)*\s+(stop|restart|start|disable|kill|mask|reload)/, reason: 'controle de serviço' },
  { re: /(^|[\s|;&(])service\s+\S+\s+(stop|restart|start)/, reason: 'controle de serviço' },
  { re: /(^|[\s|;&(])(reboot|shutdown|halt|poweroff)\b/, reason: 'desligar/reiniciar' },
  { re: /(^|[\s|;&(])chmod\s+-\w*R/, reason: 'chmod recursivo' },
  { re: /(^|[\s|;&(])chown\s+-\w*R/, reason: 'chown recursivo' },
];

/** Referência a segredos/arquivos sensíveis (ler OU escrever). */
const SENSITIVE_RE = /(\.env\b|\/\.ssh(\/|\b)|id_rsa|id_ed25519|\.pem\b|credentials|secret|token|cookies|auth\.json|\/\.aws(\/|\b)|\/\.config\/)/i;

/** Verbos/operadores que mutam o sistema de arquivos. */
const MUTATING_RE = /(^|[\s|;&(])(rm|mv|cp|tee|dd|ln|chmod|chown|install)\s|>>?/;

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
