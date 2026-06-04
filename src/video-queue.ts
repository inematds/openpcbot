import { getNextQueuedJob, getRunningJob, markJobRunning, markJobDone, markJobFailed, type VideoJob } from './db.js';

const SKILL_SLUGS: Record<VideoJob['skill'], string> = {
  explicativo: 'video-explicativo',
  curso: 'videos-cursos-inema',
  demo: 'video-demonstrativo',
};

export type ParsedCommand =
  | { ok: true; skill: VideoJob['skill']; input: string; vertical: boolean; send: boolean; silent: boolean }
  | { ok: false; error: string };

/** Parse the text after "/mkivideos" (ctx.match) for the enqueue case. */
export function parseVideoCommand(raw: string): ParsedCommand {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: 'Uso: /mkivideos <explicativo|curso|demo> <assunto/link> [--vertical] [--enviar] [--silencioso]' };

  const skillToken = tokens[0].toLowerCase();
  if (skillToken !== 'explicativo' && skillToken !== 'curso' && skillToken !== 'demo') {
    return { ok: false, error: `Skill inválida "${skillToken}". Use: explicativo, curso ou demo.` };
  }
  const skill = skillToken as VideoJob['skill'];

  const rest = tokens.slice(1);
  const vertical = rest.includes('--vertical');
  const send = rest.includes('--enviar');
  const silent = rest.includes('--silencioso');
  const input = rest.filter((t) => !t.startsWith('--')).join(' ').trim();

  if (!input) return { ok: false, error: 'Faltou o assunto/link depois da skill.' };
  return { ok: true, skill, input, vertical, send, silent };
}

/** Autonomous prompt for runAgent — runs the skill end-to-end and emits RESULT:. */
export function buildVideoPrompt(job: { skill: VideoJob['skill']; input: string; vertical: boolean }): string {
  const slug = SKILL_SLUGS[job.skill];
  const formato = job.vertical ? 'Formato 9:16 (vertical, Shorts/Reels).' : 'Use o formato padrão da skill.';
  return [
    `Use a skill \`${slug}\` para criar um vídeo a partir de: "${job.input}".`,
    formato,
    'Rode o fluxo COMPLETO de ponta a ponta de forma AUTÔNOMA, sem pedir confirmação de frames nem qualquer interação — assuma os defaults do usuário (PT-BR, dark premium âmbar, CTA INEMA.CLUB).',
    'No RENDER FINAL use a GPU: `npx hyperframes render --quality high --gpu --browser-gpu` com `timeout 900`. Se o .mp4 sair vazio (GPU falhar), faça fallback pro CPU: `npx hyperframes render --quality high` (sem flags de GPU).',
    'Ao terminar com sucesso, sua ÚLTIMA linha deve ser exatamente: `RESULT: <caminho absoluto do .mp4 final>`.',
    'Se falhar, sua ÚLTIMA linha deve ser: `ERRO: <motivo curto>`.',
  ].join('\n');
}

/** Extracts the .mp4 path from the agent output (last `RESULT:` line). Null if absent/ERRO. */
export function extractResultPath(text: string | null): string | null {
  if (!text) return null;
  let found: string | null = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*RESULT:\s*(.+\.mp4)\s*$/i);
    if (m) found = m[1].trim();
  }
  return found;
}

export interface QueueDeps {
  runAgent: (prompt: string) => Promise<{ text: string | null }>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  sendDocument: (chatId: string, path: string) => Promise<void>;
}

const SKILL_LABEL: Record<VideoJob['skill'], string> = {
  explicativo: 'explicativo', curso: 'curso INEMA', demo: 'demonstrativo',
};

/** Processes at most one job. No-op if a job is already running (concorrência = 1). */
export async function processNextJob(deps: QueueDeps): Promise<void> {
  if (getRunningJob()) return;
  const job = getNextQueuedJob();
  if (!job) return;

  markJobRunning(job.id);
  const notify = job.notify === 'sempre' && job.chat_id;
  if (notify) await deps.sendMessage(job.chat_id!, `▶️ Iniciando vídeo #${job.id} (${SKILL_LABEL[job.skill]})`);

  try {
    let opts: { vertical?: boolean } = {};
    if (job.opts) {
      try { opts = JSON.parse(job.opts) as { vertical?: boolean }; }
      catch { /* opts inválido — vertical fica false */ }
    }
    const prompt = buildVideoPrompt({ skill: job.skill, input: job.input, vertical: !!opts.vertical });
    const result = await deps.runAgent(prompt);
    const path = extractResultPath(result.text);

    if (!path) {
      const reason = result.text?.split('\n').reverse().find((l) => /ERRO:/i.test(l))?.trim() || 'sem RESULT no output do agente';
      markJobFailed(job.id, reason);
      if (notify) await deps.sendMessage(job.chat_id!, `❌ Vídeo #${job.id} falhou: ${reason}`);
      return;
    }

    markJobDone(job.id, path);
    if (notify) {
      await deps.sendMessage(job.chat_id!, `✅ Vídeo #${job.id} pronto — ${SKILL_LABEL[job.skill]}\n${path}`);
    }
    if (job.send_video && job.chat_id) {
      try { await deps.sendDocument(job.chat_id, path); }
      catch (e) { if (notify) await deps.sendMessage(job.chat_id, `(não consegui anexar o arquivo: ${(e as Error).message})`); }
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    markJobFailed(job.id, msg);
    if (notify) await deps.sendMessage(job.chat_id!, `❌ Vídeo #${job.id} falhou: ${msg}`);
  }
}

let queueTimer: NodeJS.Timeout | undefined;

/** Wires the worker to a 15s tick. Call once at boot. */
export function initVideoQueue(deps: QueueDeps): void {
  if (queueTimer) clearInterval(queueTimer);
  queueTimer = setInterval(() => { void processNextJob(deps); }, 15_000);
}
