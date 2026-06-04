import { describe, it, expect, beforeEach } from 'vitest';
import { parseVideoCommand, buildVideoPrompt, extractResultPath, processNextJob, formatQueueList, mkiHelpText } from './video-queue.js';
import { _initTestDatabase, enqueueVideoJob, listJobs, markJobRunning, getRunningJob, type VideoJob } from './db.js';

const j = (over: Partial<VideoJob>): VideoJob => ({
  id: 1, skill: 'explicativo', input: 'X', opts: null, status: 'queued',
  result_path: null, error: null, notify: 'sempre', send_video: 0,
  chat_id: '1', created_at: 0, started_at: null, finished_at: null, ...over,
});

describe('parseVideoCommand', () => {
  it('parses skill + input', () => {
    const r = parseVideoCommand('explicativo Teorema de Bayes');
    expect(r).toEqual({ ok: true, skill: 'explicativo', input: 'Teorema de Bayes', vertical: false, send: false, silent: false });
  });

  it('maps aliases curso/demo', () => {
    expect((parseVideoCommand('curso https://x') as any).skill).toBe('curso');
    expect((parseVideoCommand('demo http://localhost:3000') as any).skill).toBe('demo');
  });

  it('extracts flags and strips them from input', () => {
    const r = parseVideoCommand('explicativo Bayes --vertical --enviar --silencioso') as any;
    expect(r.input).toBe('Bayes');
    expect(r.vertical).toBe(true);
    expect(r.send).toBe(true);
    expect(r.silent).toBe(true);
  });

  it('rejects unknown skill', () => {
    expect(parseVideoCommand('foo bar')).toEqual({ ok: false, error: expect.stringContaining('explicativo') });
  });

  it('rejects empty input', () => {
    expect(parseVideoCommand('explicativo   ')).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('buildVideoPrompt', () => {
  it('includes the skill name, input and the RESULT contract', () => {
    const p = buildVideoPrompt({ skill: 'explicativo', input: 'Bayes', vertical: false });
    expect(p).toContain('video-explicativo');
    expect(p).toContain('Bayes');
    expect(p).toContain('RESULT:');
    expect(p).toContain('sem pedir confirmação');
  });

  it('instructs GPU render with CPU fallback', () => {
    const p = buildVideoPrompt({ skill: 'explicativo', input: 'X', vertical: false });
    expect(p).toContain('--browser-gpu');
    expect(p).toContain('fallback');
  });

  it('asks for 9:16 when vertical', () => {
    expect(buildVideoPrompt({ skill: 'explicativo', input: 'X', vertical: true })).toContain('9:16');
  });

  it('uses the right skill slug for curso and demo', () => {
    expect(buildVideoPrompt({ skill: 'curso', input: 'http://x', vertical: false })).toContain('videos-cursos-inema');
    expect(buildVideoPrompt({ skill: 'demo', input: 'http://x', vertical: false })).toContain('video-demonstrativo');
  });
});

describe('extractResultPath', () => {
  it('returns the path from a RESULT line', () => {
    expect(extractResultPath('blah\nRESULT: /out/video.mp4\n')).toBe('/out/video.mp4');
  });
  it('returns the last RESULT line if several', () => {
    expect(extractResultPath('RESULT: /a.mp4\nRESULT: /b.mp4')).toBe('/b.mp4');
  });
  it('returns null when ERRO is present', () => {
    expect(extractResultPath('ERRO: render falhou')).toBeNull();
  });
  it('returns null when no RESULT line', () => {
    expect(extractResultPath('done, no marker')).toBeNull();
  });
});

describe('processNextJob', () => {
  const sent: string[] = [];
  const docs: Array<{ chatId: string; path: string }> = [];
  const deps = (agentText: string | null) => ({
    runAgent: async () => ({ text: agentText }),
    sendMessage: async (chatId: string, text: string) => { sent.push(text); },
    sendDocument: async (chatId: string, path: string) => { docs.push({ chatId, path }); },
  });

  beforeEach(() => { _initTestDatabase(); sent.length = 0; docs.length = 0; });

  it('does nothing when a job is already running', async () => {
    const id = enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'sempre', sendVideo: false, chatId: '1' });
    markJobRunning(id);
    const id2 = enqueueVideoJob({ skill: 'explicativo', input: 'Y', opts: null, notify: 'sempre', sendVideo: false, chatId: '1' });
    await processNextJob(deps('RESULT: /a.mp4'));
    expect(listJobs().find((j) => j.id === id2)!.status).toBe('queued');
  });

  it('runs the next job and marks it done on RESULT', async () => {
    const id = enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'sempre', sendVideo: false, chatId: '99' });
    await processNextJob(deps('trabalho...\nRESULT: /out/x.mp4'));
    const job = listJobs().find((j) => j.id === id)!;
    expect(job.status).toBe('done');
    expect(job.result_path).toBe('/out/x.mp4');
    expect(sent.some((m) => m.includes('pronto'))).toBe(true);
    expect(docs.length).toBe(0);
  });

  it('attaches the file when send_video is set', async () => {
    enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'sempre', sendVideo: true, chatId: '99' });
    await processNextJob(deps('RESULT: /out/x.mp4'));
    expect(docs).toEqual([{ chatId: '99', path: '/out/x.mp4' }]);
  });

  it('marks failed when no RESULT and keeps queue free', async () => {
    const id = enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'sempre', sendVideo: false, chatId: '1' });
    await processNextJob(deps('ERRO: render quebrou'));
    expect(listJobs().find((j) => j.id === id)!.status).toBe('failed');
    expect(getRunningJob()).toBeNull();
  });

  it('does not notify when notify is silencioso', async () => {
    enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'silencioso', sendVideo: false, chatId: '1' });
    await processNextJob(deps('RESULT: /out/x.mp4'));
    expect(sent.length).toBe(0);
  });

  it('sends the file even when notify is silencioso (send_video set)', async () => {
    enqueueVideoJob({ skill: 'explicativo', input: 'X', opts: null, notify: 'silencioso', sendVideo: true, chatId: '7' });
    await processNextJob(deps('RESULT: /out/x.mp4'));
    expect(sent.length).toBe(0);                 // sem notificação de texto
    expect(docs).toEqual([{ chatId: '7', path: '/out/x.mp4' }]); // mas o arquivo vai
  });
});

describe('formatQueueList', () => {
  it('says empty when no active jobs', () => {
    expect(formatQueueList([])).toContain('vazia');
  });
  it('lists running first then queued', () => {
    const out = formatQueueList([
      j({ id: 2, status: 'queued', input: 'B' }),
      j({ id: 1, status: 'running', input: 'A' }),
    ]);
    expect(out.indexOf('#1')).toBeLessThan(out.indexOf('#2'));
    expect(out).toContain('▶️');
  });
  it('ignores done/failed/canceled', () => {
    expect(formatQueueList([j({ id: 9, status: 'done' })])).toContain('vazia');
  });
});

describe('mkiHelpText', () => {
  it('documents the 3 skills, the flags and the fila subcommand', () => {
    const h = mkiHelpText();
    for (const s of ['explicativo', 'curso', 'demo', '--vertical', '--enviar', '--silencioso', 'fila']) {
      expect(h).toContain(s);
    }
  });
});
