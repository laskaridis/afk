import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSession } from '../src/session.js';
import { codexAdapter } from '../src/agents/codex.js';
import type { AgentAdapter } from '../src/agents/types.js';

const fixture = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const stateDirs: string[] = [];
const previousStateDir = process.env.FAKE_CODEX_STATE_DIR;

afterEach(async () => {
  if (previousStateDir === undefined) delete process.env.FAKE_CODEX_STATE_DIR;
  else process.env.FAKE_CODEX_STATE_DIR = previousStateDir;
  await Promise.all(stateDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function invoke(step: Record<string, unknown>, options: { timeoutSeconds?: number; terminationGraceMs?: number; abortSignal?: AbortSignal; agent?: AgentAdapter } = {}) {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'afk-test-'));
  stateDirs.push(stateDir);
  await writeFile(path.join(stateDir, 'steps.json'), JSON.stringify([step]));
  process.env.FAKE_CODEX_STATE_DIR = stateDir;
  const result = await runSession({
    agent: codexAdapter,
    executable: process.execPath,
    leadingArgs: [fixture],
    cwd: stateDir,
    prompt: 'Implement the feature',
    ...options,
  });
  const call = JSON.parse(await readFile(path.join(stateDir, 'call-1.json'), 'utf8')) as {
    argv: string[]; stdin: string; cwd: string; pid: number;
  };
  return { result, call, stateDir };
}

describe('runSession', () => {
  it.each([
    ['repeat', '{"outcome":"repeat"}', { outcome: 'repeat' }],
    ['complete', '{"outcome":"complete"}', { outcome: 'complete' }],
    ['blocked', '{"outcome":"blocked","blocker_text":"Need tasks"}', { outcome: 'blocked', blockerText: 'Need tasks' }],
    ['fail', '{"outcome":"fail","failure_summary":"Tests failed"}', { outcome: 'fail', failureSummary: 'Tests failed' }],
  ])('returns a valid %s final response', async (_name, finalMessage, response) => {
    const { result } = await invoke({ finalMessage });
    expect(result).toEqual({ kind: 'response', response });
  });

  it('reports a missing final response when stdout is empty', async () => {
    const { result } = await invoke({});
    expect(result).toEqual({ kind: 'execution-error', error: { kind: 'missing-response' }, stderrTail: [] });
  });

  it('reports whitespace-only output as a missing response', async () => {
    const { result } = await invoke({ finalMessage: '   ' });
    expect(result).toEqual({ kind: 'execution-error', error: { kind: 'missing-response' }, stderrTail: [] });
  });

  it('rejects prose around protocol JSON', async () => {
    const { result } = await invoke({ finalMessage: 'Done! {"outcome":"complete"}' });
    expect(result).toEqual({ kind: 'execution-error', error: {
      kind: 'invalid-response', reason: 'final response is not valid JSON',
    }, stderrTail: [] });
  });

  it('prioritizes an unsuccessful process exit over a valid final message', async () => {
    const { result } = await invoke({ exitCode: 3, finalMessage: '{"outcome":"complete"}' });
    expect(result).toEqual({ kind: 'execution-error', error: {
      kind: 'exited-unsuccessfully', exitCode: 3, signal: null,
    }, stderrTail: [] });
  });

  it('captures stderr on a failed session without writing it to the parent', async () => {
    const writes: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => { writes.push(chunk); return true; }) as typeof process.stderr.write;
    try {
      const { result } = await invoke({ stderr: 'boom\n', exitCode: 3 });
      expect(result).toEqual({ kind: 'execution-error', error: {
        kind: 'exited-unsuccessfully', exitCode: 3, signal: null,
      }, stderrTail: ['boom'] });
      expect(writes.join('')).not.toContain('boom');
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  it('does not expose stderr on valid responses', async () => {
    const { result } = await invoke({ stderr: 'secret\n', finalMessage: '{"outcome":"complete"}' });
    expect(result).toEqual({ kind: 'response', response: { outcome: 'complete' } });
  });

  it('uses JSON printed to stdout as the final response', async () => {
    const { result } = await invoke({ stdout: '{"outcome":"complete"}' });
    expect(result).toEqual({ kind: 'response', response: { outcome: 'complete' } });
  });

  it('maps adapter-reported failure to an execution error', async () => {
    const agent: AgentAdapter = { ...codexAdapter, extractFinalMessage: () => ({ kind: 'failed', reason: 'r' }) };
    const { result } = await invoke({ stdout: 'anything' }, { agent });
    expect(result).toEqual({ kind: 'execution-error', error: {
      kind: 'agent-reported-error', reason: 'r',
    }, stderrTail: [] });
  });

  it('maps adapter-invalid output to an invalid response', async () => {
    const agent: AgentAdapter = { ...codexAdapter, extractFinalMessage: () => ({ kind: 'invalid', reason: 'bad JSON' }) };
    const { result } = await invoke({ stdout: 'anything' }, { agent });
    expect(result).toEqual({ kind: 'execution-error', error: {
      kind: 'invalid-response', reason: 'bad JSON',
    }, stderrTail: [] });
  });

  it('creates no temporary session directory', async () => {
    const isolatedTmp = await mkdtemp(path.join(os.tmpdir(), 'afk-test-tmp-'));
    stateDirs.push(isolatedTmp);
    const previousTmpdir = process.env.TMPDIR;
    process.env.TMPDIR = isolatedTmp;
    try {
      const { result, stateDir } = await invoke({ finalMessage: '{"outcome":"complete"}' });
      expect(result).toEqual({ kind: 'response', response: { outcome: 'complete' } });
      expect(await readdir(isolatedTmp)).toEqual([path.basename(stateDir)]);
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmpdir;
    }
  });

  it('reports an executable launch failure and removes its temporary directory', async () => {
    // Use a private temp root so concurrently running test files can't add entries we'd mistake for leaks.
    const isolatedTmp = await mkdtemp(path.join(os.tmpdir(), 'afk-test-tmp-'));
    stateDirs.push(isolatedTmp);
    const previousTmpdir = process.env.TMPDIR;
    process.env.TMPDIR = isolatedTmp;
    try {
      const result = await runSession({ agent: codexAdapter, executable: '/nonexistent/codex-missing', leadingArgs: [], cwd: isolatedTmp, prompt: 'x' });
      expect(result).toMatchObject({ kind: 'execution-error', error: { kind: 'launch-failed' }, stderrTail: [] });
      if (result.kind === 'execution-error' && result.error.kind === 'launch-failed') {
        expect(result.error.message.length).toBeGreaterThan(0);
      }
      expect(await readdir(isolatedTmp)).toEqual([]);
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmpdir;
    }
  });

  it('passes the prompt and workspace to a fresh Codex process without an output file', async () => {
    const { call, stateDir } = await invoke({ finalMessage: '{"outcome":"complete"}' });
    expect(call.stdin).toBe('Implement the feature');
    expect(call.cwd).toBe(await realpath(stateDir));
    expect(call.argv[0]).toBe('exec');
    expect(call.argv).toContain('--approve-for-me');
    expect(call.argv).not.toContain('resume');
    expect(call.argv).not.toContain('--output-last-message');
  });

  it('times out a session that exceeds its deadline', async () => {
    const started = Date.now();
    const { result } = await invoke({ stderr: 'timeout detail\n', sleepMs: 10000 }, { timeoutSeconds: 1 });
    expect(result).toEqual({ kind: 'timed-out' });
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it('forcibly kills a session that ignores SIGINT after the grace period', async () => {
    const started = Date.now();
    const { result, call } = await invoke(
      { sleepMs: 10000, ignoreSigint: true },
      { timeoutSeconds: 1, terminationGraceMs: 200 },
    );
    expect(result).toEqual({ kind: 'timed-out' });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(() => process.kill(call.pid, 0)).toThrow();
  });

  it('returns the final response when the session finishes before its deadline', async () => {
    const { result } = await invoke(
      { sleepMs: 100, finalMessage: '{"outcome":"complete"}' },
      { timeoutSeconds: 5 },
    );
    expect(result).toEqual({ kind: 'response', response: { outcome: 'complete' } });
  });

  it('does not overflow a timeout longer than Node can schedule at once', async () => {
    const { result } = await invoke(
      { sleepMs: 100, finalMessage: '{"outcome":"complete"}' },
      { timeoutSeconds: 2147484 },
    );
    expect(result).toEqual({ kind: 'response', response: { outcome: 'complete' } });
  });

  it('interrupts an active session when its signal aborts', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    try {
      const { result, call } = await invoke({ stderr: 'interruption detail\n', sleepMs: 10000 }, { abortSignal: controller.signal });
      expect(result).toEqual({ kind: 'interrupted' });
      expect(Date.now() - started).toBeLessThan(3000);
      expect(() => process.kill(call.pid, 0)).toThrow();
    } finally {
      clearTimeout(timer);
    }
  });

  it('force kills an interrupted session that ignores SIGINT', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    try {
      const { result, call } = await invoke(
        { sleepMs: 10000, ignoreSigint: true },
        { abortSignal: controller.signal, terminationGraceMs: 200 },
      );
      expect(result).toEqual({ kind: 'interrupted' });
      expect(Date.now() - started).toBeLessThan(3000);
      expect(() => process.kill(call.pid, 0)).toThrow();
    } finally {
      clearTimeout(timer);
    }
  });

  it('does not launch a session when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'afk-test-'));
    stateDirs.push(stateDir);
    const result = await runSession({
      agent: codexAdapter,
      executable: process.execPath,
      leadingArgs: [fixture],
      cwd: stateDir,
      prompt: 'Implement the feature',
      abortSignal: controller.signal,
    });
    expect(result).toEqual({ kind: 'interrupted' });
    expect(await readdir(stateDir)).not.toContain('call-1.json');
  });
});
