import { statSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

export interface CliOptions {
  positionals: string[];
  promptFile?: string;
  cwd: string;
  model?: string;
  reasoningEffort?: string;
  maxIterations: number;
  sessionTimeoutSeconds?: number;
}

export type ParseOptionsResult =
  | { ok: true; options: CliOptions }
  | { ok: false; message: string };

export function parseOptions(argv: string[], processCwd: string): ParseOptionsResult {
  let values: Record<string, string | undefined>;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: normalizeNegativeNumbers(argv),
      options: {
        'prompt-file': { type: 'string' },
        cwd: { type: 'string' },
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
      model: values.model,
      reasoningEffort: values['reasoning-effort'],
      maxIterations: iterationValue === undefined ? 10 : Number(iterationValue),
      sessionTimeoutSeconds: timeoutValue === undefined ? undefined : Number(timeoutValue),
    },
  };
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
