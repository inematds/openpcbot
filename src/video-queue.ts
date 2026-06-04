import type { VideoJob } from './db.js';

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
