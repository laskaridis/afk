import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli, startCli, type StartedCli } from './helpers/run-cli.js';

const complete = { finalMessage: '{"outcome":"complete"}' };
const repeat = { finalMessage: '{"outcome":"repeat"}' };
const cleanup: Array<() => Promise<void>> = [];

async function run(opts: Parameters<typeof runCli>[0]) {
  const result = await runCli(opts);
  cleanup.push(result.cleanup);
  return result;
}

async function start(opts: Parameters<typeof startCli>[0]): Promise<StartedCli> {
  const result = await startCli(opts);
  cleanup.push(result.cleanup);
  return result;
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for CLI activity');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(fn => fn()));
});

describe('built afk CLI stop outcomes', () => {
  it('reports a blocker and stops after one session', async () => {
    const result = await run({
      args: ['Prompt'],
      steps: [{ finalMessage: '{"outcome":"blocked","blocker_text":"Missing tasks file; provide specs/tasks.json"}' }],
    });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.stderr).toContain('[afk] Run blocked: Missing tasks file; provide specs/tasks.json');
  });

  it('continues after a valid task failure and completes', async () => {
    const result = await run({
      args: ['Prompt'],
      steps: [{ finalMessage: '{"outcome":"fail","failure_summary":"Tests failed"}' }, complete],
    });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('[afk] Task failed: Tests failed');
    expect(result.stderr).toContain('[afk] Run complete:');
  });

  it('retries an unsuccessful Codex exit once', async () => {
    const result = await run({ args: ['Prompt'], steps: [{ exitCode: 3 }, complete] });

    expect(result.exitCode).toBe(0);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('exit code 3');
    expect(result.stderr).toContain('retrying after execution error');
  });

  it('reports the exit status after two unsuccessful Codex exits', async () => {
    const result = await run({ args: ['Prompt'], steps: [{ exitCode: 3 }] });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('[afk] Run stopped after a repeated execution error: agent exited unsuccessfully with exit code 3');
  });

  it('stops after two invalid final responses', async () => {
    const result = await run({ args: ['Prompt'], steps: [{ finalMessage: 'Done.' }] });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('[afk] Run stopped after a repeated execution error: agent final response is invalid');
  });

  it('stops after two missing final responses', async () => {
    const result = await run({ args: ['Prompt'], steps: [{}] });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('without a final response');
  });

  it('reports two Codex launch failures before stopping', async () => {
    const emptyPath = await mkdtemp(path.join(os.tmpdir(), 'afk-empty-path-'));
    cleanup.push(() => rm(emptyPath, { recursive: true, force: true }));
    const result = await run({ args: ['Prompt'], steps: [complete], pathOverride: emptyPath });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(0);
    expect(result.stderr.match(/\[afk\] Execution error: failed to launch agent/g)).toHaveLength(2);
    expect(result.stderr).toContain('retrying after execution error');
    expect(result.stderr).toContain('[afk] Run stopped after a repeated execution error: failed to launch agent');
  });

  it('stops at the configured iteration limit', async () => {
    const result = await run({ args: ['--max-iterations', '2', 'Prompt'], steps: [repeat] });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(2);
    expect(result.stderr).toContain('reached the iteration limit of 2');
  });

  it('stops at the default ten-session limit', async () => {
    const result = await run({ args: ['Prompt'], steps: [repeat] });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(10);
    expect(result.stderr).toContain('reached the iteration limit of 10');
  }, 20000);

  it('terminates a timed-out session without retrying', async () => {
    const started = Date.now();
    const result = await run({
      args: ['--session-timeout', '3', 'Prompt'],
      steps: [{ sleepMs: 10000 }],
      timeoutMs: 10000,
    });

    expect(Date.now() - started).toBeLessThan(10000);
    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.stderr).toContain('timed out after 3 seconds');
    expect(() => process.kill(result.calls[0].pid, 0)).toThrow();
  }, 20000);

  it('keeps agent stdout hidden while the session is running', async () => {
    const result = await start({
      args: ['Prompt'],
      steps: [{ stdout: '{"outcome":"complete"}', sleepMs: 2000 }],
    });

    await waitFor(async () => (await result.calls()).length === 1);
    expect(result.child.exitCode).toBeNull();
    expect(result.child.signalCode).toBeNull();
    expect(result.stdout).toBe('');
    expect((await result.closed).exitCode).toBe(0);
    expect(result.stdout).toBe('');
  }, 20000);

  it('does not start another session after Ctrl+C', async () => {
    const result = await start({
      args: ['Prompt'],
      steps: [{ stdout: 'working\n', sleepMs: 10000, ...repeat }],
    });

    await waitFor(async () => result.stderr.includes('Iteration 1/') && (await result.calls()).length === 1);
    const calls = await result.calls();
    expect(calls).toHaveLength(1);
    result.child.kill('SIGINT');
    expect((await result.closed).exitCode).toBe(130);
    expect(result.stderr).toContain('[afk] Run interrupted by user.');
    expect(() => process.kill(calls[0].pid, 0)).toThrow();
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect((await readdir(result.stateDir)).filter(name => /^call-\d+\.json$/.test(name))).toEqual(['call-1.json']);
  }, 20000);
});
