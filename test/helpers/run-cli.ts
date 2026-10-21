import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = fileURLToPath(new URL('../..', import.meta.url));
const fixture = fileURLToPath(new URL('../fixtures/fake-codex.mjs', import.meta.url));
const cli = path.join(projectDir, 'dist/cli.js');
let built = false;

export function buildOnce(): void {
  if (built) return;
  execFileSync(path.join(projectDir, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], { cwd: projectDir, stdio: 'pipe' });
  built = true;
}

export interface CliCall {
  argv: string[];
  stdin: string;
  cwd: string;
  pid: number;
}

export interface CliRunOptions {
  args: string[];
  steps: object[];
  stdin?: string;
  workspace?: string;
  timeoutMs?: number;
  pathOverride?: string;
  agent?: string;
}

export interface StartedCli {
  child: ChildProcess;
  root: string;
  stateDir: string;
  workspace: string;
  closed: Promise<{ exitCode: number | null; signal: string | null }>;
  readonly stdout: string;
  readonly stderr: string;
  calls(): Promise<CliCall[]>;
  cleanup(): Promise<void>;
}

export async function startCli(opts: CliRunOptions): Promise<StartedCli> {
  buildOnce();
  const root = await mkdtemp(path.join(os.tmpdir(), 'afk-e2e-'));
  const stateDir = path.join(root, 'state');
  const binDir = path.join(root, 'bin');
  const workspace = opts.workspace ?? path.join(root, 'workspace');
  await Promise.all([mkdir(stateDir), mkdir(binDir), ...(opts.workspace ? [] : [mkdir(workspace)])]);
  await writeFile(path.join(stateDir, 'steps.json'), JSON.stringify(opts.steps));
  const shim = path.join(binDir, opts.agent ?? 'codex');
  await writeFile(shim, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`);
  await chmod(shim, 0o755);

  const child = spawn(process.execPath, [cli, ...opts.args], {
    cwd: workspace,
    env: {
      ...process.env,
      PATH: opts.pathOverride ?? `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_CODEX_STATE_DIR: stateDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  child.stdin?.end(opts.stdin ?? '');
  const closed = new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });

  return {
    child, root, stateDir, workspace, closed,
    get stdout() { return stdout; },
    get stderr() { return stderr; },
    async calls() {
      const names = (await readdir(stateDir))
        .filter(name => /^call-\d+\.json$/.test(name))
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      return Promise.all(names.map(async name => JSON.parse(await readFile(path.join(stateDir, name), 'utf8')) as CliCall));
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function runCli(opts: CliRunOptions): Promise<{
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  calls: CliCall[];
  stateDir: string;
  root: string;
  workspace: string;
  cleanup(): Promise<void>;
}> {
  const run = await startCli(opts);
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      run.closed,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          run.child.kill('SIGKILL');
          reject(new Error(`afk CLI did not exit within ${opts.timeoutMs ?? 15000} ms`));
        }, opts.timeoutMs ?? 15000);
      }),
    ]);
    return {
      ...result,
      stdout: run.stdout,
      stderr: run.stderr,
      calls: await run.calls(),
      stateDir: run.stateDir,
      root: run.root,
      workspace: run.workspace,
      cleanup: run.cleanup,
    };
  } catch (error) {
    if (run.child.exitCode === null && run.child.signalCode === null) {
      run.child.kill('SIGKILL');
    }
    await run.closed.catch(() => {});
    await run.cleanup();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
