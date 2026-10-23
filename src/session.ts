import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AgentAdapter } from './agents/types.js';
import type { ExecutionError, SessionResult } from './outcomes.js';
import { parseProtocolResponse } from './protocol.js';
import { createStderrTail } from './stderr-tail.js';

export const MAX_STDOUT_CHARS = 10 * 1024 * 1024;

export function attachStreamErrorGuards(child: Pick<ChildProcess, 'stdout' | 'stderr'>): void {
  child.stdout?.on('error', () => {});
  child.stderr?.on('error', () => {});
}

export interface SessionRequest {
  agent: AgentAdapter;
  executable?: string;
  leadingArgs?: string[];
  cwd: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutSeconds?: number;
  terminationGraceMs?: number;
  abortSignal?: AbortSignal;
  maxStdoutChars?: number;
}

type ProcessResult =
  | { kind: 'launch-failed'; message: string }
  | { kind: 'timed-out' }
  | { kind: 'interrupted' }
  | {
      kind: 'closed';
      code: number | null;
      signal: string | null;
      stdout: string;
      stdoutOverflowed: boolean;
      stderrTail: string[];
    };

function terminate(child: ChildProcess, graceMs: number, isClosed: () => boolean): NodeJS.Timeout {
  child.kill('SIGINT');
  return setTimeout(() => {
    if (!isClosed()) child.kill('SIGKILL');
  }, graceMs);
}

export async function runSession(request: SessionRequest): Promise<SessionResult> {
  if (request.abortSignal?.aborted) return { kind: 'interrupted' };
  const args = [
    ...(request.leadingArgs ?? []),
    ...request.agent.buildArgs({
      cwd: request.cwd,
      model: request.model,
      effort: request.reasoningEffort,
    }),
  ];

  const processResult = await new Promise<ProcessResult>(resolve => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(request.executable ?? request.agent.executable, args, {
        cwd: request.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolve({ kind: 'launch-failed', message: (error as Error).message });
      return;
    }
    let closed = false;
    let stdout = '';
    let stdoutOverflowed = false;
    const maxStdoutChars = request.maxStdoutChars ?? MAX_STDOUT_CHARS;
    const stderrTail = createStderrTail();
    attachStreamErrorGuards(child);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdoutOverflowed) return;
      const remaining = maxStdoutChars - stdout.length;
      if (chunk.length > remaining) {
        stdout += chunk.slice(0, remaining);
        stdoutOverflowed = true;
      } else {
        stdout += chunk;
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrTail.push(chunk);
    });
    let timedOut = false;
    let interrupted = false;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      if (closed || timedOut || interrupted) return;
      interrupted = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      killTimer = terminate(child, request.terminationGraceMs ?? 5000, () => closed);
    };
    request.abortSignal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', error => {
      request.abortSignal?.removeEventListener('abort', onAbort);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(interrupted ? { kind: 'interrupted' } : { kind: 'launch-failed', message: error.message });
    });
    child.once('close', (code, signal) => {
      closed = true;
      request.abortSignal?.removeEventListener('abort', onAbort);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(
        interrupted
          ? { kind: 'interrupted' }
          : timedOut
            ? { kind: 'timed-out' }
            : { kind: 'closed', code, signal, stdout, stdoutOverflowed, stderrTail: stderrTail.lines() },
      );
    });
    if (request.abortSignal?.aborted) onAbort();
    if (request.timeoutSeconds !== undefined) {
      let remainingMs = request.timeoutSeconds * 1000;
      const scheduleTimeout = () => {
        const delay = Math.min(remainingMs, 2_147_483_647);
        timeoutTimer = setTimeout(() => {
          remainingMs -= delay;
          if (remainingMs > 0) {
            scheduleTimeout();
          } else {
            if (!interrupted && !closed) {
              timedOut = true;
              killTimer = terminate(child, request.terminationGraceMs ?? 5000, () => closed);
            }
          }
        }, delay);
      };
      scheduleTimeout();
    }
    child.stdin.on('error', () => {});
    child.stdin.end(request.prompt);
  });

  if (processResult.kind === 'timed-out') return { kind: 'timed-out' };
  if (processResult.kind === 'interrupted') return { kind: 'interrupted' };
  const executionError = (error: ExecutionError): SessionResult => ({
    kind: 'execution-error',
    error,
    stderrTail: processResult.kind === 'closed' ? processResult.stderrTail : [],
  });
  if (processResult.kind === 'launch-failed') {
    return executionError({ kind: 'launch-failed', message: processResult.message });
  }
  if (processResult.code !== 0) {
    if (processResult.code !== null && !processResult.stdoutOverflowed) {
      const extracted = request.agent.extractFinalMessage(processResult.stdout);
      if (extracted.kind === 'failed') {
        return executionError({ kind: 'agent-reported-error', reason: extracted.reason });
      }
    }
    return executionError({
      kind: 'exited-unsuccessfully',
      exitCode: processResult.code,
      signal: processResult.signal,
    });
  }

  if (processResult.stdoutOverflowed)
    return executionError({
      kind: 'invalid-response',
      reason: 'agent output exceeded the size limit',
    });

  const extracted = request.agent.extractFinalMessage(processResult.stdout);
  if (extracted.kind === 'missing') return executionError({ kind: 'missing-response' });
  if (extracted.kind === 'invalid') return executionError({ kind: 'invalid-response', reason: extracted.reason });
  if (extracted.kind === 'failed')
    return executionError({
      kind: 'agent-reported-error',
      reason: extracted.reason,
    });

  const parsed = parseProtocolResponse(extracted.text);
  return parsed.ok
    ? { kind: 'response', response: parsed.response }
    : executionError({ kind: 'invalid-response', reason: parsed.reason });
}
