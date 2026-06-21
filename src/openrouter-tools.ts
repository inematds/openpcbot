import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename } from 'node:path';
import { logger } from './logger.js';
import type { OpenRouterTool } from './openrouter.js';

const execFileAsync = promisify(execFile);

/**
 * Tools exposed to OpenRouter models. v1 is READ-ONLY by design: a single
 * `bash` tool whose executor only permits inspection commands and refuses
 * anything that could mutate the machine or reach the network. The bot runs on
 * the user's own box, so the threat model is "a cheaper non-Claude model
 * running shell commands here" — the guard blocks writes, deletes, command
 * chaining/substitution, and redirects, not reads.
 *
 * To add write/bash power later, widen ALLOWED_BINARIES and relax the guards.
 */
export const OPENROUTER_TOOLS: OpenRouterTool[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description:
        'Run a single READ-ONLY shell command on the host to inspect files, directories, git state, or system info. ' +
        'Allowed: ls, cat, head, tail, grep, rg, find, wc, git (read-only subcommands), ps, df, du, stat, tree, jq, date, and similar. ' +
        'NOT allowed: writing/deleting files, network commands, pipes, redirects, command chaining (; | && > < `$()`), or running scripts/interpreters. ' +
        'Use absolute paths to inspect other projects (e.g. /home/nmaldaner/projetos/<name>). For anything that writes or builds, tell the user to use /claude instead.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The read-only command to run, e.g. "ls -la /home/nmaldaner/projetos" or "git -C /repo log --oneline -5".' },
        },
        required: ['command'],
      },
    },
  },
];

/** Read-only command binaries the model may invoke (matched by basename). */
const ALLOWED_BINARIES = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'find', 'wc',
  'pwd', 'echo', 'printf', 'date', 'whoami', 'hostname', 'uname', 'df', 'du',
  'free', 'uptime', 'ps', 'git', 'stat', 'file', 'tree', 'which', 'type',
  'sort', 'uniq', 'cut', 'tr', 'column', 'basename', 'dirname', 'realpath',
  'readlink', 'env', 'printenv', 'jq', 'yq', 'nl', 'tac', 'ldd', 'lsof',
]);

/** find predicates that execute or mutate — refused even though find is read-only. */
const FIND_DANGEROUS = ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprintf', '-fls'];

/**
 * git subcommands that are purely read-only with no destructive flags, so they
 * need no further argument parsing. Deliberately excludes branch/remote/tag/
 * config (which have write forms like -D / add / -d / set). Widen later with
 * per-subcommand flag checks if needed.
 */
const GIT_READONLY = new Set([
  'status', 'log', 'diff', 'diff-tree', 'show', 'ls-files', 'ls-tree', 'blame',
  'rev-parse', 'describe', 'shortlog', 'cat-file', 'grep', 'whatchanged', 'reflog',
]);

/** git global options (before the subcommand) that are safe; -C/--git-dir/--work-tree take a value. */
const GIT_GLOBAL_VALUE_OPTS = new Set(['-C', '--git-dir', '--work-tree']);
const GIT_GLOBAL_FLAG_OPTS = new Set(['--no-pager', '-p', '--paginate', '--bare']);

const MAX_OUTPUT_CHARS = 8000;

/** Validate one segment of a pipeline (a single command + args). */
function checkSegment(seg: string): string | null {
  const tokens = seg.trim().split(/\s+/);
  const bin = basename(tokens[0]);
  if (!ALLOWED_BINARIES.has(bin)) {
    return `command "${bin}" not in the read-only allow-list. For write/build operations, the user should use /claude.`;
  }
  if (bin === 'find' && tokens.some((t) => FIND_DANGEROUS.includes(t))) {
    return 'find with -exec/-delete/-ok/-fprint is not allowed (read-only)';
  }
  if (bin === 'git') {
    // Skip safe global options (e.g. `-C <path>`) to find the real subcommand.
    let i = 1;
    while (i < tokens.length && tokens[i].startsWith('-')) {
      const t = tokens[i];
      const name = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
      if (GIT_GLOBAL_VALUE_OPTS.has(name)) {
        i += t.includes('=') ? 1 : 2; // `--git-dir=/x` consumes 1 token, `-C .` consumes 2
        continue;
      }
      if (GIT_GLOBAL_FLAG_OPTS.has(name)) {
        i += 1;
        continue;
      }
      return `git global option "${name}" not allowed (read-only)`;
    }
    const sub = tokens[i];
    if (!sub || !GIT_READONLY.has(sub)) {
      return `git "${sub ?? ''}" is not a read-only subcommand`;
    }
  }
  return null;
}

/**
 * Reject a command, returning the reason string the model will see.
 * Pipes (|) are allowed between allow-listed read-only commands, since a
 * pipeline of reads is still a read. Everything that could mutate or escape —
 * chaining (; && ||), redirects (> <), background (&), command substitution
 * ($() / backticks), newlines — is refused. The check is string-based and
 * fails safe: ambiguous input (e.g. quoted metacharacters) is blocked, never
 * allowed.
 */
function guard(command: string): string | null {
  const cmd = command.trim();
  if (!cmd) return 'empty command';
  if (cmd.length > 2000) return 'command too long';
  if (cmd.includes('$(')) return 'command substitution $(...) not allowed';
  if (cmd.includes('||')) return 'logical OR (||) not allowed (read-only)';
  // Block chaining, redirects, background, substitution, newlines — but NOT pipes.
  if (/[;&><\n\r`]/.test(cmd)) return 'metacharacters not allowed (read-only: no ; & > < ` or newlines; pipes between read-only commands are ok)';

  for (const segment of cmd.split('|')) {
    if (!segment.trim()) return 'empty pipeline segment not allowed';
    const reason = checkSegment(segment);
    if (reason) return reason;
  }
  return null;
}

/**
 * Execute a tool call from an OpenRouter model. Returns a string result that is
 * fed back to the model as a tool message. Never throws — failures are returned
 * as text so the model can react.
 */
export async function executeOpenRouterTool(name: string, argsJson: string): Promise<string> {
  let args: { command?: string };
  try {
    args = JSON.parse(argsJson || '{}');
  } catch {
    return 'error: tool arguments were not valid JSON';
  }

  if (name !== 'bash') return `error: unknown tool "${name}"`;

  const command = (args.command ?? '').trim();
  const reason = guard(command);
  if (reason) {
    logger.warn({ command, reason }, 'OpenRouter tool blocked');
    return `blocked: ${reason}`;
  }

  try {
    const { stdout, stderr } = await execFileAsync('bash', ['-c', command], {
      timeout: 15_000,
      maxBuffer: 2 * 1024 * 1024,
      cwd: process.cwd(),
    });
    let out = (stdout || stderr || '(no output)').toString();
    if (out.length > MAX_OUTPUT_CHARS) out = out.slice(0, MAX_OUTPUT_CHARS) + '\n... (truncated)';
    logger.info({ command }, 'OpenRouter tool ran');
    return out;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
    if (e.killed) return 'error: command timed out (15s)';
    const out = (e.stderr || e.stdout || e.message || 'command failed').toString();
    return `error: ${out.slice(0, MAX_OUTPUT_CHARS)}`;
  }
}
