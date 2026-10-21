import { statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_AGENT, agentNames, getAgent } from './agents/index.js';
import type { AgentAdapter } from './agents/index.js';

export interface CliOptions {
  positionals: string[];
  promptFile?: string;
  cwd: string;
  agent: AgentAdapter;
  model?: string;
  reasoningEffort?: string;
  maxIterations: number;
  sessionTimeoutSeconds?: number;
}

export type ParseOptionsResult =
  | { ok: true; help: true }
  | { ok: true; help?: undefined; options: CliOptions }
  | { ok: false; message: string };

export function parseOptions(argv: string[], processCwd: string): ParseOptionsResult {
  if (requestsHelp(argv)) return { ok: true, help: true };

  let values: Record<string, string | undefined>;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: normalizeNegativeNumbers(argv),
      options: {
        'prompt-file': { type: 'string' },
        cwd: { type: 'string' },
        agent: { type: 'string' },
        model: { type: 'string' },
        'reasoning-effort': { type: 'string' },
        'max-iterations': { type: 'string' },
        'session-timeout': { type: 'string' },
      },
      strict: true,
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const iterationValue = values['max-iterations'];
  if (iterationValue !== undefined && !isPositiveSafeInteger(iterationValue)) {
    return { ok: false, message: `--max-iterations must be a positive integer, got "${iterationValue}"` };
  }

  const timeoutValue = values['session-timeout'];
  if (timeoutValue !== undefined && !isPositiveSafeInteger(timeoutValue)) {
    return { ok: false, message: `--session-timeout must be a positive integer number of seconds, got "${timeoutValue}"` };
  }

  if (values.model !== undefined && values.model.trim() === '') {
    return { ok: false, message: '--model must not be empty' };
  }
  if (values['reasoning-effort'] !== undefined && values['reasoning-effort'].trim() === '') {
    return { ok: false, message: '--reasoning-effort must not be empty' };
  }
  if (values.agent !== undefined && getAgent(values.agent) === undefined) {
    return { ok: false, message: `--agent must be one of: ${agentNames().join(', ')}, got "${values.agent}"` };
  }

  const cwdValue = values.cwd;
  const cwd = path.resolve(processCwd, cwdValue ?? '.');
  try {
    if (!statSync(cwd).isDirectory()) {
      return { ok: false, message: `--cwd "${cwdValue}" is not an existing directory` };
    }
  } catch {
    return { ok: false, message: `--cwd "${cwdValue}" is not an existing directory` };
  }

  return {
    ok: true,
    options: {
      positionals,
      promptFile: values['prompt-file'],
      cwd,
      agent: getAgent(values.agent ?? DEFAULT_AGENT)!,
      model: values.model,
      reasoningEffort: values['reasoning-effort'],
      maxIterations: iterationValue === undefined ? 10 : Number(iterationValue),
      sessionTimeoutSeconds: timeoutValue === undefined ? undefined : Number(timeoutValue),
    },
  };
}

// Help wins over every other problem, including parse errors, so it is detected before parseArgs runs.
function requestsHelp(argv: string[]): boolean {
  const end = argv.indexOf('--');
  return (end === -1 ? argv : argv.slice(0, end)).some(arg => arg === '--help' || arg === '-h');
}

function isPositiveSafeInteger(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
}

function normalizeNegativeNumbers(argv: string[]): string[] {
  const args: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      args.push(...argv.slice(index));
      break;
    }
    if ((arg === '--max-iterations' || arg === '--session-timeout') && /^-\d/.test(argv[index + 1] ?? '')) {
      args.push(`${arg}=${argv[++index]}`);
    } else {
      args.push(arg);
    }
  }
  return args;
}
