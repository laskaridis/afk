import type { RunOutcome, SessionResult } from './outcomes.js';
import { formatExecutionError, formatIterationStart, formatTaskFailure } from './report.js';

export interface RunLoopConfig {
  maxIterations: number;
  sessionTimeoutSeconds?: number;
  abortSignal?: AbortSignal;
}

export type SessionRunner = () => Promise<SessionResult>;

export async function runLoop(
  config: RunLoopConfig,
  runSession: SessionRunner,
  log: (line: string) => void,
): Promise<RunOutcome> {
  let consecutiveExecutionErrors = 0;
  let isRetry = false;
  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    if (config.abortSignal?.aborted) return { kind: 'interrupted' };
    log(formatIterationStart(iteration, config.maxIterations, isRetry));
    const result = await runSession();

    switch (result.kind) {
      case 'response':
        consecutiveExecutionErrors = 0;
        isRetry = false;
        switch (result.response.outcome) {
          case 'repeat':
            continue;
          case 'complete':
            return { kind: 'complete' };
          case 'blocked':
            return { kind: 'blocked', blockerText: result.response.blockerText };
          case 'fail':
            log(formatTaskFailure(result.response.failureSummary));
            continue;
        }
      case 'execution-error':
        log(formatExecutionError(result.error));
        consecutiveExecutionErrors++;
        if (consecutiveExecutionErrors >= 2) return { kind: 'execution-error', error: result.error };
        isRetry = true;
        continue;
      case 'timed-out':
        return { kind: 'timed-out', timeoutSeconds: config.sessionTimeoutSeconds as number };
      case 'interrupted':
        return { kind: 'interrupted' };
    }
  }
  return { kind: 'iteration-limit', maxIterations: config.maxIterations };
}
