import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildOnce } from './helpers/run-cli.js';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const cli = path.join(projectDir, 'dist/cli.js');
const dirs: string[] = [];
const children: ChildProcess[] = [];

beforeAll(buildOnce);

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function startCli(steps: object[], args: string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'afk-cli-test-'));
  dirs.push(root);
  const stateDir = path.join(root, 'state');
  const binDir = path.join(root, 'bin');
  await Promise.all([mkdir(stateDir), mkdir(binDir)]);
  await writeFile(path.join(stateDir, 'steps.json'), JSON.stringify(steps));
  const shim = path.join(binDir, 'codex');
  await writeFile(shim, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`);
  await chmod(shim, 0o755);

  const child = spawn(process.execPath, [cli, ...args], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_CODEX_STATE_DIR: stateDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.push(child);
  let stderr = '';
  child.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });
  child.stdout?.resume();
  child.stdin?.end();
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  return {
    child,
    stateDir,
    closed,
    get stderr() {
      return stderr;
    },
  };
}

async function waitForCall(stateDir: string) {
  const callFile = path.join(stateDir, 'call-1.json');
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      return JSON.parse(await readFile(callFile, 'utf8')) as { pid: number };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Codex did not start');
}

describe('afk executable', () => {
  it('builds an executable with a Node shebang', async () => {
    expect((await readFile(cli, 'utf8')).split('\n', 1)[0]).toBe('#!/usr/bin/env node');
  });

  it('forwards SIGINT and stops without launching another session', async () => {
    const run = await startCli([{ stdout: 'working', sleepMs: 10000 }], ['Prompt']);
    const call = await waitForCall(run.stateDir);
    expect(run.stderr).toContain('Iteration 1/');

    run.child.kill('SIGINT');
    expect(await run.closed).toBe(130);
    expect(run.stderr).toContain('[afk] Run interrupted by user.');
    expect((await readdir(run.stateDir)).filter(name => /^call-\d+\.json$/.test(name))).toEqual(['call-1.json']);
    expect(() => process.kill(call.pid, 0)).toThrow();
  }, 8000);

  it('force kills Codex when it ignores SIGINT', async () => {
    const run = await startCli([{ stdout: 'working', sleepMs: 10000, ignoreSigint: true }], ['Prompt']);
    const call = await waitForCall(run.stateDir);

    run.child.kill('SIGINT');
    expect(await run.closed).toBe(130);
    expect(run.stderr).toContain('[afk] Run interrupted by user.');
    expect((await readdir(run.stateDir)).filter(name => /^call-\d+\.json$/.test(name))).toEqual(['call-1.json']);
    expect(() => process.kill(call.pid, 0)).toThrow();
  }, 10000);

  it('reports missing prompt input without launching Codex', async () => {
    const run = await startCli([{ finalMessage: '{"outcome":"complete"}' }], []);

    expect(await run.closed).toBe(2);
    expect(run.stderr).toContain('afk: input error:');
    expect((await readdir(run.stateDir)).filter(name => /^call-\d+\.json$/.test(name))).toEqual([]);
  });
});
