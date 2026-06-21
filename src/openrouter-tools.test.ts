import { describe, it, expect } from 'vitest';
import { executeOpenRouterTool } from './openrouter-tools.js';

const bash = (command: string) => executeOpenRouterTool('bash', JSON.stringify({ command }));

describe('executeOpenRouterTool — read-only guard', () => {
  it('runs an allowed command and returns its output', async () => {
    const out = await bash('echo hello-openrouter');
    expect(out).toContain('hello-openrouter');
  });

  it('runs pwd', async () => {
    const out = await bash('pwd');
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).not.toMatch(/^blocked:/);
  });

  it('blocks destructive commands not in the allow-list', async () => {
    expect(await bash('rm -rf /tmp/whatever')).toMatch(/^blocked:/);
    expect(await bash('mv a b')).toMatch(/^blocked:/);
    expect(await bash('python -c "print(1)"')).toMatch(/^blocked:/);
    expect(await bash('curl https://example.com')).toMatch(/^blocked:/);
  });

  it('blocks command chaining and redirects', async () => {
    expect(await bash('ls ; rm -rf x')).toMatch(/metacharacters/);
    expect(await bash('ls && rm x')).toMatch(/metacharacters/);
    expect(await bash('echo hi > /tmp/x')).toMatch(/metacharacters/);
    expect(await bash('cat `whoami`')).toMatch(/metacharacters/);
    expect(await bash('ls || rm x')).toMatch(/logical OR/);
  });

  it('allows pipes between read-only commands but blocks a pipe to a forbidden command', async () => {
    const ok = await bash('echo abc | grep a');
    expect(ok).not.toMatch(/^blocked:/);
    expect(ok).toContain('abc');
    // every segment must be allow-listed
    expect(await bash('cat /etc/hostname | rm -rf x')).toMatch(/^blocked:/);
    expect(await bash('ls | python')).toMatch(/^blocked:/);
  });

  it('blocks command substitution', async () => {
    expect(await bash('echo $(rm -rf /)')).toMatch(/substitution/);
  });

  it('blocks dangerous find predicates but allows plain find', async () => {
    expect(await bash('find . -delete')).toMatch(/^blocked:/);
    expect(await bash('find /etc -name "x" -exec rm {} ;')).toMatch(/metacharacters|blocked/);
    const ok = await bash('find . -maxdepth 1 -name "package.json"');
    expect(ok).not.toMatch(/^blocked:/);
  });

  it('allows read-only git but blocks writes', async () => {
    expect(await bash('git status')).not.toMatch(/^blocked:/);
    expect(await bash('git -C . log --oneline -1')).not.toMatch(/^blocked:/);
    expect(await bash('git push origin main')).toMatch(/^blocked:/);
    expect(await bash('git commit -m x')).toMatch(/^blocked:/);
  });

  it('rejects unknown tool names', async () => {
    expect(await executeOpenRouterTool('write_file', '{}')).toMatch(/unknown tool/);
  });

  it('handles invalid JSON arguments', async () => {
    expect(await executeOpenRouterTool('bash', 'not json')).toMatch(/not valid JSON/);
  });
});
