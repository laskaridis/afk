import { describe, expect, it } from 'vitest';
import { runLoop, type RunLoopConfig } from '../src/run-loop.js';
import type { SessionResult } from '../src/outcomes.js';

function scripted(results: SessionResult[], config: RunLoopConfig = { maxIterations: 3 }) {
  const logs: string[] = [];
  let calls = 0;
  const runner = async (): Promise<SessionResult> => {
    const result = results[calls++];
    if (!result) throw new Error('unexpected session');
    return result;
  };
  return { logs, get calls() { return calls; }, run: () => runLoop(config, runner, line => logs.push(line)) };
}

const repeat: SessionResult = { kind: 'response', response: { outcome: 'repeat' } };
const complete: SessionResult = { kind: 'response', response: { outcome: 'complete' } };
const blocked: SessionResult = { kind: 'response', response: { outcome: 'blocked', blockerText: 'Need tasks file' } };
const fail: SessionResult = { kind: 'response', response: { outcome: 'fail', failureSummary: 'tests failed' } };

describe('runLoop', () => {
  it('accepts completion on the first session', async () => {
    const script = scripted([complete]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(1);
    expect(script.logs).toEqual(['[afk] Iteration 1/3: starting agent session']);
  });

  it('starts a fresh session after repeat and logs each start', async () => {
    const script = scripted([repeat, complete]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(2);
    expect(script.logs).toEqual([
      '[afk] Iteration 1/3: starting agent session',
      '[afk] Iteration 2/3: starting agent session',
    ]);
  });

  it('reports a task failure and starts another session', async () => {
    const script = scripted([fail, complete]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(2);
    expect(script.logs).toContain('[afk] Task failed: tests failed');
  });

  it('stops on a reported blocker', async () => {
    const script = scripted([blocked, complete]);
    expect(await script.run()).toEqual({ kind: 'blocked', blockerText: 'Need tasks file' });
    expect(script.calls).toBe(1);
  });

  it.each([
    { label: 'repeat', results: [repeat, repeat], maxIterations: 2 },
    { label: 'fail', results: [fail], maxIterations: 1 },
  ])('reaches the limit after a final $label', async ({ results, maxIterations }) => {
    const script = scripted(results, { maxIterations });
    expect(await script.run()).toEqual({ kind: 'iteration-limit', maxIterations });
    expect(script.calls).toBe(maxIterations);
  });

  it.each([
    { label: 'complete', result: complete, expected: { kind: 'complete' } },
    { label: 'blocked', result: blocked, expected: { kind: 'blocked', blockerText: 'Need tasks file' } },
  ])('respects $label on the last allowed session', async ({ result, expected }) => {
    const script = scripted([result], { maxIterations: 1 });
    expect(await script.run()).toEqual(expected);
    expect(script.calls).toBe(1);
  });

  it('stops immediately after a timeout', async () => {
    const script = scripted([{ kind: 'timed-out' }, complete], { maxIterations: 3, sessionTimeoutSeconds: 7 });
    expect(await script.run()).toEqual({ kind: 'timed-out', timeoutSeconds: 7 });
    expect(script.calls).toBe(1);
  });

  it('stops immediately after an interrupted session', async () => {
    const script = scripted([{ kind: 'interrupted' }, complete]);
    expect(await script.run()).toEqual({ kind: 'interrupted' });
    expect(script.calls).toBe(1);
  });

  it('does not start a session when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const script = scripted([complete], { maxIterations: 3, abortSignal: controller.signal });
    expect(await script.run()).toEqual({ kind: 'interrupted' });
    expect(script.calls).toBe(0);
    expect(script.logs).toEqual([]);
  });

  it('does not start another session after aborting between sessions', async () => {
    const controller = new AbortController();
    let calls = 0;
    const logs: string[] = [];
    const result = await runLoop({ maxIterations: 3, abortSignal: controller.signal }, async () => {
      calls++;
      controller.abort();
      return repeat;
    }, line => logs.push(line));
    expect(result).toEqual({ kind: 'interrupted' });
    expect(calls).toBe(1);
  });

  it('logs an execution error and retries once', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([{ kind: 'execution-error', error }, complete]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(2);
    expect(script.logs).toEqual([
      '[afk] Iteration 1/3: starting agent session',
      '[afk] Execution error: agent exited without a final response',
      '[afk] Iteration 2/3: retrying after execution error',
    ]);
  });

  it('prints captured stderr directly after an execution error', async () => {
    const script = scripted([
      { kind: 'execution-error', error: { kind: 'missing-response' }, stderrTail: ['a', 'b'] },
      complete,
    ]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.logs).toEqual([
      '[afk] Iteration 1/3: starting agent session',
      '[afk] Execution error: agent exited without a final response',
      'a',
      'b',
      '[afk] Iteration 2/3: retrying after execution error',
    ]);
  });

  it('prints no extra lines when an execution error has an empty or absent stderr tail', async () => {
    for (const tail of [undefined, []]) {
      const script = scripted([
        { kind: 'execution-error', error: { kind: 'missing-response' }, stderrTail: tail },
      ], { maxIterations: 1 });
      await script.run();
      expect(script.logs).toEqual([
        '[afk] Iteration 1/1: starting agent session',
        '[afk] Execution error: agent exited without a final response',
      ]);
    }
  });

  it('prints at most the last 20 stderr lines', async () => {
    const tail = Array.from({ length: 30 }, (_, index) => `l${index + 1}`);
    const script = scripted([
      { kind: 'execution-error', error: { kind: 'missing-response' }, stderrTail: tail },
    ], { maxIterations: 1 });
    await script.run();
    expect(script.logs).toEqual([
      '[afk] Iteration 1/1: starting agent session',
      '[afk] Execution error: agent exited without a final response',
      ...tail.slice(-20),
    ]);
  });

  it('stops after two consecutive execution errors and reports the second', async () => {
    const first = { kind: 'missing-response' } as const;
    const second = { kind: 'invalid-response', reason: 'bad JSON' } as const;
    const script = scripted([
      { kind: 'execution-error', error: first, stderrTail: ['first'] },
      { kind: 'execution-error', error: second, stderrTail: ['second'] },
      complete,
    ]);
    expect(await script.run()).toEqual({ kind: 'execution-error', error: second });
    expect(script.calls).toBe(2);
    expect(script.logs).toEqual([
      '[afk] Iteration 1/3: starting agent session',
      '[afk] Execution error: agent exited without a final response',
      'first',
      '[afk] Iteration 2/3: retrying after execution error',
      '[afk] Execution error: agent final response is invalid: bad JSON',
      'second',
    ]);
  });

  it('resets the execution-error allowance after a valid response', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([
      { kind: 'execution-error', error }, repeat,
      { kind: 'execution-error', error }, complete,
    ], { maxIterations: 4 });
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(4);
    expect(script.logs).toContain('[afk] Iteration 3/4: starting agent session');
    expect(script.logs).toContain('[afk] Iteration 4/4: retrying after execution error');
  });

  it('treats fail as a valid response that resets the allowance', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([fail, { kind: 'execution-error', error }, complete]);
    expect(await script.run()).toEqual({ kind: 'complete' });
    expect(script.calls).toBe(3);
    expect(script.logs).toContain('[afk] Task failed: tests failed');
    expect(script.logs).toContain('[afk] Iteration 3/3: retrying after execution error');
  });

  it('reaches the limit when the first execution error uses the final iteration', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([{ kind: 'execution-error', error }, complete], { maxIterations: 1 });
    expect(await script.run()).toEqual({ kind: 'iteration-limit', maxIterations: 1 });
    expect(script.calls).toBe(1);
  });

  it('reaches the limit when repeat precedes a final-iteration execution error', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([repeat, { kind: 'execution-error', error }, complete], { maxIterations: 2 });
    expect(await script.run()).toEqual({ kind: 'iteration-limit', maxIterations: 2 });
    expect(script.calls).toBe(2);
  });

  it('does not retry after a timeout on the retry session', async () => {
    const error = { kind: 'missing-response' } as const;
    const script = scripted([
      { kind: 'execution-error', error }, { kind: 'timed-out' }, complete,
    ], { maxIterations: 3, sessionTimeoutSeconds: 7 });
    expect(await script.run()).toEqual({ kind: 'timed-out', timeoutSeconds: 7 });
    expect(script.calls).toBe(2);
  });

  it('waits for each session before starting the next', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const result = await runLoop({ maxIterations: 2 }, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return ++calls === 1 ? repeat : complete;
    }, () => {});
    expect(result).toEqual({ kind: 'complete' });
    expect(calls).toBe(2);
    expect(peak).toBe(1);
  });
});
