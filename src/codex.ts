import { spawn } from 'child_process';
import { logger } from './logger.js';

export interface CodexResult {
  text: string;
  exitCode: number | null;
}

const SIGKILL_DELAY = 5_000; // 5s after SIGTERM, force kill

function forceKill(proc: ReturnType<typeof spawn>): void {
  proc.kill('SIGTERM');
  const killTimer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      // already dead
    }
  }, SIGKILL_DELAY);
  killTimer.unref();
}

/**
 * Run a message through the Codex CLI (OpenAI) in full-auto mode.
 * Returns the stdout output.
 */
export async function runCodex(
  message: string,
  options?: { cwd?: string; timeout?: number; abortSignal?: AbortSignal },
): Promise<CodexResult> {
  const cwd = options?.cwd ?? process.cwd();
  const timeout = options?.timeout ?? 900_000; // 15 min default

  return new Promise((resolve, reject) => {
    const proc = spawn('codex', ['exec', '--full-auto', message], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      logger.warn({ pid: proc.pid, cwd }, 'Codex timed out, killing');
      forceKill(proc);
      if (!settled) {
        settled = true;
        const partial = stdout.trim() || stderr.trim();
        resolve({
          text: partial ? `(timeout — partial output)\n\n${partial}` : 'Codex timed out with no output',
          exitCode: null,
        });
      }
    }, timeout);
    timer.unref();

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        forceKill(proc);
      }, { once: true });
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (stderr && code !== 0) {
        logger.warn({ exitCode: code, stderr: stderr.slice(0, 500) }, 'Codex stderr');
      }
      // Return output even on non-zero exit (partial results)
      const text = stdout.trim() || stderr.trim() || `Codex exited with code ${code}`;
      resolve({ text, exitCode: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new Error(`Codex failed to start: ${err.message}`));
    });
  });
}

/**
 * Check if Codex CLI is available.
 */
export async function codexAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('codex', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}
