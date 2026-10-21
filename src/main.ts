import { EXIT_CODES } from './exit-codes.js';
import { codexAdapter } from './agents/codex.js';
import { parseOptions } from './options.js';
import { resolvePrompt, readStream } from './prompt.js';
import { buildSessionPrompt } from './session-prompt.js';
import { runSession } from './session.js';
import { runLoop } from './run-loop.js';
import { HELP_TEXT } from './help.js';
import { exitCodeFor, formatFinalStatus, formatInputError, formatOptionError } from './report.js';

export interface MainIo {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
  processCwd: string;
  abortSignal?: AbortSignal;
  codex?: { executable: string; leadingArgs: string[] };
}

export async function main(argv: string[], io: MainIo): Promise<number> {
  const parsed = parseOptions(argv, io.processCwd);
  if (!parsed.ok) {
    io.stderr.write(formatOptionError(parsed.message) + '\n');
    return EXIT_CODES.usageError;
  }

  if (parsed.help) {
    io.stdout.write(HELP_TEXT);
    return EXIT_CODES.success;
  }

  const options = parsed.options;
  const resolved = await resolvePrompt({
    positionals: options.positionals,
    promptFile: options.promptFile,
    processCwd: io.processCwd,
    stdin: {
      isTTY: io.stdin.isTTY === true,
      read: () => readStream(io.stdin),
    },
  });
  if (!resolved.ok) {
    io.stderr.write(formatInputError(resolved.message) + '\n');
    return EXIT_CODES.usageError;
  }

  const sessionPrompt = buildSessionPrompt(resolved.prompt);
  const outcome = await runLoop(
    {
      maxIterations: options.maxIterations,
      sessionTimeoutSeconds: options.sessionTimeoutSeconds,
      abortSignal: io.abortSignal,
    },
    () => runSession({
      agent: codexAdapter,
      executable: io.codex?.executable ?? 'codex',
      leadingArgs: io.codex?.leadingArgs ?? [],
      cwd: options.cwd,
      prompt: sessionPrompt,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      timeoutSeconds: options.sessionTimeoutSeconds,
      abortSignal: io.abortSignal,
    }),
    line => { io.stderr.write(line + '\n'); },
  );
  io.stderr.write(formatFinalStatus(outcome) + '\n');
  return exitCodeFor(outcome);
}
