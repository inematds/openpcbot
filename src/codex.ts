import { spawn } from 'child_process';
import { logger } from './logger.js';

export interface CodexResult {
  text: string;
  exitCode: number | null;
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
  const timeout = options?.timeout ?? 300_000; // 5 min default

  return new Promise((resolve, reject) => {
    const proc = spawn('codex', ['--full-auto', message], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Codex timed out'));
    }, timeout);

    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
      }, { once: true });
    }

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderr && code !== 0) {
        logger.warn({ exitCode: code, stderr: stderr.slice(0, 500) }, 'Codex stderr');
      }
      // Return output even on non-zero exit (partial results)
      const text = stdout.trim() || stderr.trim() || `Codex exited with code ${code}`;
      resolve({ text, exitCode: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
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
