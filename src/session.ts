import { spawn, type ChildProcess } from 'node:child_process';
import type { AgentAdapter } from './agents/types.js';
import type { SessionResult } from './outcomes.js';
import { parseProtocolResponse } from './protocol.js';

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
}

type ProcessResult =
  | { kind: 'launch-failed'; message: string }
  | { kind: 'timed-out' }
  | { kind: 'interrupted' }
  | { kind: 'closed'; code: number | null; signal: string | null; stdout: string };

function terminate(child: ChildProcess, graceMs: number, isClosed: () => boolean): NodeJS.Timeout {
  child.kill('SIGINT');
  return setTimeout(() => {
    if (!isClosed()) child.kill('SIGKILL');
  }, graceMs);
}

export async function runSession(request: SessionRequest): Promise<SessionResult> {
  if (request.abortSignal?.aborted) return { kind: 'interrupted' };
  const args = [...(request.leadingArgs ?? []), ...request.agent.buildArgs({
    cwd: request.cwd,
    model: request.model,
    effort: request.reasoningEffort,
  })];

  const processResult = await new Promise<ProcessResult>(resolve => {
    let child;
    try {
      child = spawn(request.executable ?? request.agent.executable, args, {
        cwd: request.cwd,
        stdio: ['pipe', 'pipe', 'inherit'],
      });
    } catch (error) {
      resolve({ kind: 'launch-failed', message: (error as Error).message });
      return;
    }
    let closed = false;
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
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
      resolve(interrupted ? { kind: 'interrupted' } : timedOut ? { kind: 'timed-out' } : { kind: 'closed', code, signal, stdout });
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
  if (processResult.kind === 'launch-failed') {
    return { kind: 'execution-error', error: { kind: 'launch-failed', message: processResult.message } };
  }
  if (processResult.code !== 0) {
    return { kind: 'execution-error', error: {
      kind: 'exited-unsuccessfully', exitCode: processResult.code, signal: processResult.signal,
    } };
  }

  const extracted = request.agent.extractFinalMessage(processResult.stdout);
  if (extracted.kind === 'missing') return { kind: 'execution-error', error: { kind: 'missing-response' } };
  if (extracted.kind === 'invalid') return { kind: 'execution-error', error: { kind: 'invalid-response', reason: extracted.reason } };
  if (extracted.kind === 'failed') return { kind: 'execution-error', error: {
    kind: 'exited-unsuccessfully', exitCode: 0, signal: null, reason: extracted.reason,
  } };

  const parsed = parseProtocolResponse(extracted.text);
  return parsed.ok
    ? { kind: 'response', response: parsed.response }
    : { kind: 'execution-error', error: { kind: 'invalid-response', reason: parsed.reason } };
}
