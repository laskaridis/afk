import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const projectDir = fileURLToPath(new URL('..', import.meta.url));

it('describes both supported coding agents', async () => {
  const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
  expect(packageJson.description).toBe(
    'Run a coding agent (Codex, Claude Code) unattended, one task per fresh session',
  );
  expect(packageJson.description).not.toBe('Run a Codex coding agent unattended, one task per fresh session');
});

it('builds on install and runs the packed executable through npm exec', async () => {
  const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
  expect(packageJson.scripts.prepare).toBe('npm run build');

  const root = await mkdtemp(path.join(os.tmpdir(), 'afk-package-test-'));
  try {
    const env = { ...process.env, npm_config_cache: path.join(root, 'npm-cache') };
    const packOutput = execFileSync('npm', ['pack', '--json', '--pack-destination', root], {
      cwd: projectDir,
      encoding: 'utf8',
      env,
    });
    const [packed] = JSON.parse(packOutput) as Array<{ filename: string; files: Array<{ path: string }> }>;
    const contents = packed.files.map(file => file.path);
    expect(contents).toContain('dist/cli.js');
    expect(contents).toContain('dist/harness.md');
    expect(contents).toContain('package.json');
    expect(contents.some(file => /^(src|test|specs)\//.test(file))).toBe(false);

    const result = spawnSync('npm', ['exec', '--yes', `--package=${path.join(root, packed.filename)}`, '--', 'afk'], {
      cwd: root,
      input: '',
      encoding: 'utf8',
      timeout: 90000,
      env,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('afk: input error:');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
