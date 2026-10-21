import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildCodexArgs } from './codex-args.js';
import type { SessionResult } from './outcomes.js';
import { parseProtocolResponse } from './protocol.js';

export interface SessionRequest {
  executable: string;
  leadingArgs: string[];
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
  | { kind: 'closed'; code: number | null; signal: string | null };

function terminate(child: ChildProcess, graceMs: number, isClosed: () => boolean): NodeJS.Timeout {
  child.kill('SIGINT');
  return setTimeout(() => {
    if (!isClosed()) child.kill('SIGKILL');
  }, graceMs);
}

export async function runSession(request: SessionRequest): Promise<SessionResult> {
  if (request.abortSignal?.aborted) return { kind: 'interrupted' };
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'afk-'));
  const outputFile = path.join(tempDir, 'last-message.txt');

  try {
    const args = [...request.leadingArgs, ...buildCodexArgs({
      cwd: request.cwd,
      outputFile,
      model: request.model,
      reasoningEffort: request.reasoningEffort,
    })];

    const processResult = await new Promise<ProcessResult>(resolve => {
      let child;
      try {
        child = spawn(request.executable, args, {
          cwd: request.cwd,
          stdio: ['pipe', 'inherit', 'inherit'],
        });
      } catch (error) {
        resolve({ kind: 'launch-failed', message: (error as Error).message });
        return;
      }
      let closed = false;
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
        resolve(interrupted ? { kind: 'interrupted' } : timedOut ? { kind: 'timed-out' } : { kind: 'closed', code, signal });
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

    let finalMessage: string;
    try {
      finalMessage = await readFile(outputFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { kind: 'execution-error', error: { kind: 'missing-response' } };
      }
      return { kind: 'execution-error', error: {
        kind: 'invalid-response', reason: `could not read final response: ${(error as Error).message}`,
      } };
    }
    if (finalMessage.trim() === '') {
      return { kind: 'execution-error', error: { kind: 'missing-response' } };
    }

    const parsed = parseProtocolResponse(finalMessage);
    return parsed.ok
      ? { kind: 'response', response: parsed.response }
      : { kind: 'execution-error', error: { kind: 'invalid-response', reason: parsed.reason } };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
