import { getNextQueuedJob, getRunningJob, markJobRunning, markJobDone, markJobFailed, type VideoJob } from './db.js';

const SKILL_SLUGS: Record<VideoJob['skill'], string> = {
  explicativo: 'video-explicativo',
  curso: 'videos-cursos-inema',
  demo: 'video-demonstrativo',
};

export type ParsedCommand =
  | { ok: true; skill: VideoJob['skill']; input: string; vertical: boolean; send: boolean; silent: boolean; dest?: string }
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
  let vertical = false, send = false, silent = false;
  let dest: string | undefined;
  const inputTokens: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (t === '--vertical') vertical = true;
    else if (t === '--enviar') send = true;
    else if (t === '--silencioso') silent = true;
    else if (t === '--pasta') { dest = rest[i + 1]; i++; } // consome o valor
    else if (t.startsWith('--')) { /* flag desconhecida: ignora */ }
    else inputTokens.push(t);
  }
  const input = inputTokens.join(' ').trim();
  if (!input) return { ok: false, error: 'Faltou o assunto/link depois da skill.' };
  return { ok: true, skill, input, vertical, send, silent, dest };
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
  moveVideo: (src: string, dest: string) => Promise<string>;
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
    let opts: { vertical?: boolean; dest?: string } = {};
    if (job.opts) {
      try { opts = JSON.parse(job.opts) as { vertical?: boolean; dest?: string }; }
      catch { /* opts inválido — ignora */ }
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

    let finalPath = path;
    if (opts.dest) {
      try { finalPath = await deps.moveVideo(path, opts.dest); }
      catch (e) {
        finalPath = path;
        if (notify) await deps.sendMessage(job.chat_id!, `⚠ Vídeo #${job.id} renderizou mas não consegui mover pra ${opts.dest}: ${(e as Error).message}. Ficou em ${path}`);
      }
    }

    markJobDone(job.id, finalPath);
    if (notify) {
      await deps.sendMessage(job.chat_id!, `✅ Vídeo #${job.id} pronto — ${SKILL_LABEL[job.skill]}\n${finalPath}`);
    }
    if (job.send_video && job.chat_id) {
      try { await deps.sendDocument(job.chat_id, finalPath); }
      catch (e) { if (notify) await deps.sendMessage(job.chat_id, `(não consegui anexar o arquivo: ${(e as Error).message})`); }
    }
    return;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    markJobFailed(job.id, msg);
    if (notify) await deps.sendMessage(job.chat_id!, `❌ Vídeo #${job.id} falhou: ${msg}`);
  }
}

/** Renders the active queue (running + queued) for `/mkivideos fila`. */
export function formatQueueList(jobs: VideoJob[]): string {
  const running = jobs.filter((j) => j.status === 'running');
  const queued = jobs.filter((j) => j.status === 'queued').sort((a, b) => a.created_at - b.created_at || a.id - b.id);
  const active = [...running, ...queued];
  if (active.length === 0) return '📭 Fila vazia.';
  const line = (jb: VideoJob) => {
    const icon = jb.status === 'running' ? '▶️' : '⏳';
    const inp = jb.input.length > 40 ? jb.input.slice(0, 40) + '…' : jb.input;
    return `${icon} #${jb.id} ${jb.skill} — ${inp}`;
  };
  return ['📋 Fila de vídeos:', ...active.map(line)].join('\n');
}

/** Help text shown by `/mkivideos help` (and when called with no args). */
export function mkiHelpText(): string {
  return [
    '🎬 <b>/mkivideos</b> — fila de vídeos (1 por vez)',
    '',
    '<b>Criar vídeo:</b>',
    '  /mkivideos explicativo &lt;assunto&gt;',
    '  /mkivideos curso &lt;link do curso&gt;',
    '  /mkivideos demo &lt;link do app&gt;',
    '',
    '<b>Flags (no fim):</b>',
    '  --vertical    gera 9:16 (Shorts/Reels) em vez do padrão',
    '  --enviar      anexa o .mp4 no Telegram ao terminar',
    '  --silencioso  não notifica; aparece só no painel',
    '  --pasta <caminho>  move o .mp4 pra essa pasta (ou caminho .mp4 completo)',
    '',
    '<b>Fila:</b>',
    '  /mkivideos fila               mostra a fila',
    '  /mkivideos fila cancelar &lt;id&gt;  cancela um job que ainda espera',
    '  /mkivideos help               esta ajuda',
    '',
    'Painel: http://localhost:3141/videos?token=…',
  ].join('\n');
}

let queueTimer: NodeJS.Timeout | undefined;

/** Wires the worker to a 15s tick. Call once at boot. */
export function initVideoQueue(deps: QueueDeps): void {
  if (queueTimer) clearInterval(queueTimer);
  queueTimer = setInterval(() => { void processNextJob(deps); }, 15_000);
}
