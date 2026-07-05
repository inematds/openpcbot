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
