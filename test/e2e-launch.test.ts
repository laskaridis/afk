import { mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './helpers/run-cli.js';

const complete = { finalMessage: '{"outcome":"complete"}' };
const repeat = { finalMessage: '{"outcome":"repeat"}' };
const cleanup: Array<() => Promise<void>> = [];

async function run(opts: Parameters<typeof runCli>[0]) {
  const result = await runCli(opts);
  cleanup.push(result.cleanup);
  return result;
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'afk-e2e-input-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(fn => fn()));
});

describe('built afk CLI launch', () => {
  it.each(['--help', '-h'])('prints help on stdout and exits 0 for %s without launching Codex', async flag => {
    const result = await run({ args: [flag], steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^Usage: afk/);
    expect(result.stderr).toBe('');
    expect(result.calls).toEqual([]);
  });

  it('passes the original positional prompt into fresh sequential sessions', async () => {
    const result = await run({ args: ['Implement feature X'], steps: [repeat, complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0].pid).not.toBe(result.calls[1].pid);
    for (const call of result.calls) {
      expect(call.stdin.startsWith('Implement feature X')).toBe(true);
      expect(call.stdin).toContain('Instructions from the afk harness:');
      expect(call.argv[0]).toBe('exec');
      expect(call.argv).toContain('--approve-for-me');
      expect(call.argv).not.toContain('resume');
      expect(call.argv).not.toContain('fork');
      expect(call.cwd).toBe(await realpath(result.workspace));
    }
    expect(result.stderr).toContain('Iteration 1/10');
    expect(result.stderr).toContain('Iteration 2/10');
  });

  it('passes prompt file contents unchanged at the start of the session prompt', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'prompt.txt');
    await writeFile(file, 'From file\nSecond line');

    const result = await run({ args: ['--prompt-file', file], steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].stdin.startsWith('From file\nSecond line')).toBe(true);
  });

  it('passes piped stdin unchanged at the start of the session prompt', async () => {
    const result = await run({ args: [], stdin: 'From stdin\nSecond line', steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].stdin.startsWith('From stdin\nSecond line')).toBe(true);
  });

  it('rejects two prompt sources before launching Codex', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'prompt.txt');
    await writeFile(file, 'From file');

    for (const opts of [
      { args: ['Positional'], stdin: 'From stdin', steps: [complete] },
      { args: ['--prompt-file', file, 'Positional'], steps: [complete] },
    ]) {
      const result = await run(opts);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('afk: input error:');
      expect(result.calls).toHaveLength(0);
    }
  });

  it('rejects an empty positional prompt before launching Codex', async () => {
    const result = await run({ args: [''], steps: [complete] });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('afk: input error:');
    expect(result.calls).toHaveLength(0);
  });

  it('rejects missing input and an unreadable prompt file before launching Codex', async () => {
    for (const args of [[], ['--prompt-file', path.join(await tempDir(), 'missing.txt')]]) {
      const result = await run({ args, steps: [complete] });
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('afk: input error:');
      expect(result.calls).toHaveLength(0);
    }
  });

  it('uses the selected existing workspace for the Codex process and --cd', async () => {
    const otherWorkspace = await tempDir();
    const result = await run({ args: ['--cwd', otherWorkspace, 'Prompt'], steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].cwd).toBe(await realpath(otherWorkspace));
    const cdIndex = result.calls[0].argv.indexOf('--cd');
    expect(cdIndex).toBeGreaterThan(-1);
    expect(result.calls[0].argv[cdIndex + 1]).toBe(otherWorkspace);
  });

  it('passes model and reasoning overrides on the initial session and an execution retry', async () => {
    const result = await run({
      args: ['--model', 'm1', '--reasoning-effort', 'low', 'Prompt'],
      steps: [{ exitCode: 1 }, complete],
    });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0].pid).not.toBe(result.calls[1].pid);
    for (const call of result.calls) {
      expect(call.argv).toContain('--approve-for-me');
      expect(call.argv).not.toContain('resume');
      expect(call.argv).not.toContain('fork');
      const modelIndex = call.argv.indexOf('--model');
      const configIndex = call.argv.indexOf('--config');
      expect(call.argv[modelIndex + 1]).toBe('m1');
      expect(call.argv[configIndex + 1]).toBe('model_reasoning_effort="low"');
      expect(call.stdin.startsWith('Prompt')).toBe(true);
    }
  });

  it('inherits model and reasoning settings when no override is supplied', async () => {
    const result = await run({ args: ['Prompt'], steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls[0].argv).not.toContain('--model');
    expect(result.calls[0].argv.some(arg => arg.includes('model_reasoning_effort'))).toBe(false);
  });

  it('leaves the workspace empty and uses no final-response file', async () => {
    const result = await run({ args: ['Prompt'], steps: [complete] });

    expect(result.exitCode).toBe(0);
    expect(await readdir(result.workspace)).toEqual([]);
    const argv = result.calls[0].argv;
    expect(argv).not.toContain('--output-last-message');
  });

  it('starts a fresh session budget when launched again in the same workspace', async () => {
    const workspace = await tempDir();
    const opts = { args: ['--max-iterations', '1', 'Prompt'], steps: [repeat], workspace };

    const first = await run(opts);
    const second = await run(opts);

    expect(first.exitCode).toBe(1);
    expect(second.exitCode).toBe(1);
    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
    expect(first.stderr).toContain('Iteration 1/1');
    expect(second.stderr).toContain('Iteration 1/1');
  });
});
