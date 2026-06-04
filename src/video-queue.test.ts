import { describe, it, expect } from 'vitest';
import { parseVideoCommand, buildVideoPrompt, extractResultPath } from './video-queue.js';

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
