import { EXIT_CODES } from './exit-codes.js';
import type { ExecutionError, RunOutcome } from './outcomes.js';

export function describeExecutionError(error: ExecutionError): string {
  switch (error.kind) {
    case 'launch-failed':
      return `failed to launch agent: ${error.message}`;
    case 'exited-unsuccessfully':
      return error.exitCode !== null
        ? `agent exited unsuccessfully with exit code ${error.exitCode}`
        : `agent exited unsuccessfully due to signal ${error.signal}`;
    case 'agent-reported-error':
      return `agent exited unsuccessfully: ${error.reason}`;
    case 'missing-response':
      return 'agent exited without a final response';
    case 'invalid-response':
      return `agent final response is invalid: ${error.reason}`;
  }
}

export function formatIterationStart(iteration: number, maxIterations: number, isRetry: boolean): string {
  return isRetry
    ? `[afk] Iteration ${iteration}/${maxIterations}: retrying after execution error`
    : `[afk] Iteration ${iteration}/${maxIterations}: starting agent session`;
}

export function formatExecutionError(error: ExecutionError): string {
  return `[afk] Execution error: ${describeExecutionError(error)}`;
}

export function formatTaskFailure(summary: string): string {
  return `[afk] Task failed: ${summary}`;
}

export function formatFinalStatus(outcome: RunOutcome): string {
  switch (outcome.kind) {
    case 'complete':
      return '[afk] Run complete: the code skill reported feature completion.';
    case 'blocked':
      return `[afk] Run blocked: ${outcome.blockerText}`;
    case 'execution-error':
      return `[afk] Run stopped after a repeated execution error: ${describeExecutionError(outcome.error)}`;
    case 'iteration-limit':
      return `[afk] Run stopped: reached the iteration limit of ${outcome.maxIterations} without reported completion.`;
    case 'timed-out':
      return `[afk] Run stopped: agent session timed out after ${outcome.timeoutSeconds} seconds.`;
    case 'interrupted':
      return '[afk] Run interrupted by user.';
  }
}

export function exitCodeFor(outcome: RunOutcome): number {
  switch (outcome.kind) {
    case 'complete':
      return EXIT_CODES.success;
    case 'interrupted':
      return EXIT_CODES.interrupted;
    default:
      return EXIT_CODES.failure;
  }
}

export function formatInputError(message: string): string {
  return `afk: input error: ${message}`;
}

export function formatOptionError(message: string): string {
  return `afk: option error: ${message}`;
}
