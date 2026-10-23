import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { main } from '../../src/main.js';
import type { CliCall } from './run-cli.js';

export const AGENT_FIXTURES: Record<string, string> = {
  codex: fileURLToPath(new URL('../fixtures/fake-codex.mjs', import.meta.url)),
  claude: fileURLToPath(new URL('../fixtures/fake-claude.mjs', import.meta.url)),
};

export async function runAgentScenario(
  agentName: string,
  steps: object[],
  extraArgs: string[] = [],
  opts: { abortSignal?: AbortSignal } = {},
): Promise<{ exitCode: number; stderrLines: string[]; stdout: string; calls: CliCall[] }> {
  const fixture = AGENT_FIXTURES[agentName];
  if (!fixture) throw new Error(`No fixture for agent ${agentName}`);
  const root = await mkdtemp(path.join(os.tmpdir(), 'afk-agent-test-'));
  const stateDir = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  const previousStateDir = process.env.FAKE_AGENT_STATE_DIR;
  try {
    await Promise.all([mkdir(stateDir), mkdir(workspace)]);
    await writeFile(path.join(stateDir, 'steps.json'), JSON.stringify(steps));
    process.env.FAKE_AGENT_STATE_DIR = stateDir;
    const stderr: string[] = [];
    const stdout: string[] = [];
    const exitCode = await main(['--agent', agentName, ...extraArgs, 'Prompt'], {
      stdin: Object.assign(Readable.from([]), { isTTY: true }),
      stdout: {
        write: chunk => {
          stdout.push(chunk);
        },
      },
      stderr: {
        write: chunk => {
          stderr.push(chunk);
        },
      },
      processCwd: workspace,
      abortSignal: opts.abortSignal,
      launcher: { executable: process.execPath, leadingArgs: [fixture] },
    });
    const names = (await readdir(stateDir))
      .filter(name => /^call-\d+\.json$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const calls = await Promise.all(
      names.map(async name => JSON.parse(await readFile(path.join(stateDir, name), 'utf8')) as CliCall),
    );
    return {
      exitCode,
      stderrLines: stderr.join('').trimEnd().split('\n'),
      stdout: stdout.join(''),
      calls,
    };
  } finally {
    if (previousStateDir === undefined) delete process.env.FAKE_AGENT_STATE_DIR;
    else process.env.FAKE_AGENT_STATE_DIR = previousStateDir;
    await rm(root, { recursive: true, force: true });
  }
}
