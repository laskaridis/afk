import { describe, expect, it } from 'vitest';
import {
  describeExecutionError,
  exitCodeFor,
  formatExecutionError,
  formatFinalStatus,
  formatInputError,
  formatIterationStart,
  formatOptionError,
  formatTaskFailure,
} from '../src/report.js';
import type { ExecutionError, RunOutcome } from '../src/outcomes.js';

describe('execution error descriptions', () => {
  it.each<[ExecutionError, string]>([
    [{ kind: 'launch-failed', message: 'ENOENT' }, 'failed to launch agent: ENOENT'],
    [{ kind: 'exited-unsuccessfully', exitCode: 3, signal: null }, 'agent exited unsuccessfully with exit code 3'],
    [{ kind: 'exited-unsuccessfully', exitCode: 0, signal: null, reason: 'Claude reported an error (subtype: x)' }, 'agent exited unsuccessfully: Claude reported an error (subtype: x)'],
    [{ kind: 'exited-unsuccessfully', exitCode: null, signal: 'SIGTERM' }, 'agent exited unsuccessfully due to signal SIGTERM'],
    [{ kind: 'missing-response' }, 'agent exited without a final response'],
    [{ kind: 'invalid-response', reason: 'bad JSON' }, 'agent final response is invalid: bad JSON'],
  ])('describes %j', (error, expected) => {
    expect(describeExecutionError(error)).toBe(expected);
  });
});

describe('activity lines', () => {
  it('announces a new session', () => {
    expect(formatIterationStart(1, 10, false)).toBe('[afk] Iteration 1/10: starting agent session');
  });

  it('announces an execution error retry', () => {
    expect(formatIterationStart(2, 10, true)).toBe('[afk] Iteration 2/10: retrying after execution error');
  });

  it('reports an execution error', () => {
    expect(formatExecutionError({ kind: 'launch-failed', message: 'ENOENT' })).toBe('[afk] Execution error: failed to launch agent: ENOENT');
  });

  it('reports an agent supplied failure reason', () => {
    const error = { kind: 'exited-unsuccessfully', exitCode: 0, signal: null, reason: 'Claude reported an error' } as const;
    expect(formatExecutionError(error)).toBe('[afk] Execution error: agent exited unsuccessfully: Claude reported an error');
    expect(formatFinalStatus({ kind: 'execution-error', error })).toBe(
      '[afk] Run stopped after a repeated execution error: agent exited unsuccessfully: Claude reported an error',
    );
  });

  it('reports a failed task', () => {
    expect(formatTaskFailure('tests failed')).toBe('[afk] Task failed: tests failed');
  });
});

describe('final statuses', () => {
  it.each<[RunOutcome, string]>([
    [{ kind: 'complete' }, '[afk] Run complete: the code skill reported feature completion.'],
    [{ kind: 'blocked', blockerText: 'Need tasks' }, '[afk] Run blocked: Need tasks'],
    [{ kind: 'execution-error', error: { kind: 'missing-response' } }, '[afk] Run stopped after a repeated execution error: agent exited without a final response'],
    [{ kind: 'iteration-limit', maxIterations: 7 }, '[afk] Run stopped: reached the iteration limit of 7 without reported completion.'],
    [{ kind: 'timed-out', timeoutSeconds: 12 }, '[afk] Run stopped: agent session timed out after 12 seconds.'],
    [{ kind: 'interrupted' }, '[afk] Run interrupted by user.'],
  ])('formats %j', (outcome, expected) => {
    expect(formatFinalStatus(outcome)).toBe(expected);
  });
});

describe('exit codes', () => {
  it.each<[RunOutcome, number]>([
    [{ kind: 'complete' }, 0],
    [{ kind: 'blocked', blockerText: 'Need tasks' }, 1],
    [{ kind: 'execution-error', error: { kind: 'missing-response' } }, 1],
    [{ kind: 'iteration-limit', maxIterations: 10 }, 1],
    [{ kind: 'timed-out', timeoutSeconds: 5 }, 1],
    [{ kind: 'interrupted' }, 130],
  ])('maps %j to %i', (outcome, expected) => {
    expect(exitCodeFor(outcome)).toBe(expected);
  });
});

describe('invocation errors', () => {
  it('formats an input error', () => {
    expect(formatInputError('missing prompt')).toBe('afk: input error: missing prompt');
  });

  it('formats an option error', () => {
    expect(formatOptionError('bad limit')).toBe('afk: option error: bad limit');
  });
});
