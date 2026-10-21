import type { ProtocolResponse } from './protocol.js';

export type ExecutionError =
  | { kind: 'launch-failed'; message: string }
  | { kind: 'exited-unsuccessfully'; exitCode: number | null; signal: string | null; reason?: string }
  | { kind: 'missing-response' }
  | { kind: 'invalid-response'; reason: string };

export type SessionResult =
  | { kind: 'response'; response: ProtocolResponse }
  | { kind: 'execution-error'; error: ExecutionError; stderrTail?: string[] }
  | { kind: 'timed-out' }
  | { kind: 'interrupted' };

export type RunOutcome =
  | { kind: 'complete' }
  | { kind: 'blocked'; blockerText: string }
  | { kind: 'execution-error'; error: ExecutionError }
  | { kind: 'iteration-limit'; maxIterations: number }
  | { kind: 'timed-out'; timeoutSeconds: number }
  | { kind: 'interrupted' };
