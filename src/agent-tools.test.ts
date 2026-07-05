import { describe, it, expect } from 'vitest';
import { classifyRisk } from './agent-tools.js';
import { executeShell, AGENT_TOOLS } from './agent-tools.js';

describe('classifyRisk', () => {
  const grave = [
    'rm -rf /home/nmaldaner/projetos/x',
    'rm -r build',
    'rmdir foo',
    'find . -name "*.tmp" -delete',
    'sudo systemctl restart nginx',
    'apt install cowsay',
    'pip install requests',
    'npm install -g typescript',
    'kill -9 1234',
    'systemctl stop openpcbot',
    'reboot',
    'cat .env',
    'cat /home/nmaldaner/.ssh/id_rsa',
    'echo x > /etc/hosts',
    'truncate -s 0 log.txt',
    'dd if=/dev/zero of=disk.img',
  ];
  const auto = [
    'ls /home/nmaldaner/projetos',
    'cat /home/nmaldaner/projetos/openpcbot/package.json',
    'git push origin main',
    'curl -X POST https://api.exemplo.com -d @body.json',
    'npm run build',
    'npm publish',
    'mkdir -p /home/nmaldaner/projetos/novo',
    'echo "oi" > /home/nmaldaner/projetos/openpcbot/nota.txt',
    'grep -r TODO /home/nmaldaner/projetos/openpcbot/src',
    'gh pr create',
  ];

  for (const cmd of grave) {
    it(`grave: ${cmd}`, () => expect(classifyRisk(cmd).level).toBe('grave'));
  }
  for (const cmd of auto) {
    it(`auto: ${cmd}`, () => expect(classifyRisk(cmd).level).toBe('auto'));
  }

  it('inclui um motivo nos graves', () => {
    expect(classifyRisk('sudo rm -rf /').reason).toBeTruthy();
  });
});

describe('executeShell', () => {
  it('roda comando e devolve stdout', async () => {
    const out = await executeShell('echo ola-mundo');
    expect(out).toContain('ola-mundo');
  });
  it('não lança em comando que falha; devolve texto de erro', async () => {
    const out = await executeShell('ls /caminho/que/nao/existe/xyz');
    expect(out.toLowerCase()).toContain('error');
  });
});

describe('AGENT_TOOLS', () => {
  it('expõe um tool bash', () => {
    expect(AGENT_TOOLS[0].function.name).toBe('bash');
  });
});
