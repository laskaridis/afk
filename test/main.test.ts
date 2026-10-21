import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { main } from '../src/main.js';
import { HELP_TEXT } from '../src/help.js';

const fixture = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const dirs: string[] = [];
const originalStateDir = process.env.FAKE_CODEX_STATE_DIR;

afterEach(async () => {
  if (originalStateDir === undefined) delete process.env.FAKE_CODEX_STATE_DIR;
  else process.env.FAKE_CODEX_STATE_DIR = originalStateDir;
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function setup(steps: object[]) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'afk-main-test-'));
  dirs.push(stateDir);
  await writeFile(path.join(stateDir, 'steps.json'), JSON.stringify(steps));
  process.env.FAKE_CODEX_STATE_DIR = stateDir;
  const lines: string[] = [];
  const out: string[] = [];
  const invoke = (argv: string[], stdinText?: string) => main(argv, {
    stdin: Object.assign(Readable.from(stdinText === undefined ? [] : [stdinText]), { isTTY: stdinText === undefined }),
    stdout: { write: (chunk: string) => out.push(chunk) },
    stderr: { write: (chunk: string) => lines.push(chunk) },
    processCwd: stateDir,
    launcher: { executable: process.execPath, leadingArgs: [fixture] },
  });
  const calls = async () => (await readdir(stateDir)).filter(name => /^call-\d+\.json$/.test(name));
  return { stateDir, lines, out, invoke, calls };
}

describe('main', () => {
  it('runs a positional prompt to completion and reports success', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    const code = await run.invoke(['Implement feature X']);

    expect(code).toBe(0);
    expect(run.lines).toContain('[afk] Run complete: the code skill reported feature completion.\n');
    const call = JSON.parse(await readFile(path.join(run.stateDir, 'call-1.json'), 'utf8'));
    expect(call.stdin).toMatch(/^Implement feature X\n\n---\nInstructions from the afk harness:/m);
    expect(call.cwd).toBe(await realpath(run.stateDir));
    expect(call.argv.slice(0, 2)).toEqual(['exec', '--approve-for-me']);
  });

  it('launches Claude with its adapter arguments and unchanged overrides on an execution retry', async () => {
    const run = await setup([{ exitCode: 3 }, { finalMessage: '{"outcome":"complete"}' }]);

    await run.invoke(['--agent', 'claude', '--model', 'claude-model', '--reasoning-effort', 'high', 'Prompt']);

    expect(await run.calls()).toHaveLength(2);
    for (const name of await run.calls()) {
      const call = JSON.parse(await readFile(path.join(run.stateDir, name), 'utf8'));
      expect(call.argv.slice(0, 5)).toEqual(['-p', '--output-format', 'json', '--permission-mode', 'auto']);
      expect(call.argv.slice(-4)).toEqual(['--model', 'claude-model', '--effort', 'high']);
    }
  });

  it('passes unchanged model and effort overrides to the default Codex adapter', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    expect(await run.invoke(['--model', 'codex-model', '--reasoning-effort', 'high', 'Prompt'])).toBe(0);
    const call = JSON.parse(await readFile(path.join(run.stateDir, 'call-1.json'), 'utf8'));
    expect(call.argv).toContain('codex-model');
    expect(call.argv).toContain('model_reasoning_effort="high"');
  });

  it('rejects an unsupported agent before launching a session', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    expect(await run.invoke(['--agent', 'other', 'Prompt'])).toBe(2);
    expect(run.lines.some(line => line.startsWith('afk: option error:'))).toBe(true);
    expect(await run.calls()).toEqual([]);
  });

  it.each(['--help', '-h'])('prints help to stdout for %s without launching a session', async (flag) => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    const code = await run.invoke([flag, '--max-iterations', '0'], 'unused');

    expect(code).toBe(0);
    expect(run.out.join('')).toBe(HELP_TEXT);
    expect(run.lines).toEqual([]);
    expect(await run.calls()).toEqual([]);
  });

  it('prints help despite an invalid agent value', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    expect(await run.invoke(['--agent', 'bogus', '--help'])).toBe(0);
    expect(run.out.join('')).toBe(HELP_TEXT);
    expect(run.lines).toEqual([]);
    expect(await run.calls()).toEqual([]);
  });

  it('rejects invalid options before reading stdin or launching a session', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    const code = await run.invoke(['--max-iterations', '0', 'Prompt'], 'unused');

    expect(code).toBe(2);
    expect(run.lines.some(line => line.startsWith('afk: option error:'))).toBe(true);
    expect(await run.calls()).toEqual([]);
  });

  it('rejects conflicting prompt sources before launching a session', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    const code = await run.invoke(['Prompt'], 'Piped prompt');

    expect(code).toBe(2);
    expect(run.lines.some(line => line.startsWith('afk: input error:'))).toBe(true);
    expect(await run.calls()).toEqual([]);
  });

  it('rejects a missing prompt from a terminal', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);

    expect(await run.invoke([])).toBe(2);
    expect(run.lines.some(line => line.startsWith('afk: input error:'))).toBe(true);
    expect(await run.calls()).toEqual([]);
  });

  it('reports a blocked response and exits unsuccessfully', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"blocked","blocker_text":"Provide tasks"}' }]);

    expect(await run.invoke(['Prompt'])).toBe(1);
    expect(run.lines).toContain('[afk] Run blocked: Provide tasks\n');
    expect(await run.calls()).toHaveLength(1);
  });

  it('prints each execution error stderr tail before retry and final status', async () => {
    const run = await setup([
      { exitCode: 3, stderr: 'first\n' },
      { exitCode: 4, stderr: 'second\n' },
    ]);

    expect(await run.invoke(['Prompt'])).toBe(1);
    expect(run.lines).toEqual([
      '[afk] Iteration 1/10: starting agent session\n',
      '[afk] Execution error: agent exited unsuccessfully with exit code 3\n',
      'first\n',
      '[afk] Iteration 2/10: retrying after execution error\n',
      '[afk] Execution error: agent exited unsuccessfully with exit code 4\n',
      'second\n',
      '[afk] Run stopped after a repeated execution error: agent exited unsuccessfully with exit code 4\n',
    ]);
  });

  it('runs the session in the selected workspace', async () => {
    const run = await setup([{ finalMessage: '{"outcome":"complete"}' }]);
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'afk-workspace-'));
    dirs.push(workspace);

    expect(await run.invoke(['--cwd', workspace, 'Prompt'])).toBe(0);
    const call = JSON.parse(await readFile(path.join(run.stateDir, 'call-1.json'), 'utf8'));
    expect(call.cwd).toBe(await realpath(workspace));
  });

  it('gives a second invocation a fresh session budget', async () => {
    const first = await setup([{ finalMessage: '{"outcome":"repeat"}' }]);
    expect(await first.invoke(['--max-iterations', '1', 'Prompt'])).toBe(1);
    expect(await first.calls()).toHaveLength(1);

    const second = await setup([{ finalMessage: '{"outcome":"repeat"}' }]);
    expect(await second.invoke(['--max-iterations', '1', 'Prompt'])).toBe(1);
    expect(await second.calls()).toHaveLength(1);
    expect(first.lines).toContain('[afk] Iteration 1/1: starting agent session\n');
    expect(second.lines).toContain('[afk] Iteration 1/1: starting agent session\n');
  });
});
