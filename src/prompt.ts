import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PromptStdin {
  isTTY: boolean;
  read: () => Promise<string>;
}

export type ResolvePromptResult =
  | { ok: true; prompt: string }
  | { ok: false; message: string };

export async function resolvePrompt(input: {
  positionals: string[];
  promptFile?: string;
  processCwd: string;
  stdin: PromptStdin;
}): Promise<ResolvePromptResult> {
  const { positionals, promptFile, processCwd, stdin } = input;
  if (positionals.length > 1) {
    return { ok: false, message: `expected a single prompt argument but received ${positionals.length}; quote the prompt` };
  }

  const stdinText = stdin.isTTY ? '' : await stdin.read();
  const sources: string[] = [];
  if (positionals.length === 1) sources.push('prompt argument');
  if (promptFile !== undefined) sources.push('--prompt-file');
  if (!stdin.isTTY && stdinText.trim() !== '') sources.push('stdin');

  if (sources.length > 1) {
    return { ok: false, message: `multiple prompt sources provided (${sources.join(', ')}); use exactly one of a prompt argument, --prompt-file, or stdin` };
  }
  if (sources.length === 0) {
    return { ok: false, message: 'no prompt provided; pass a prompt argument, --prompt-file <path>, or pipe the prompt on stdin' };
  }

  if (positionals.length === 1) {
    return positionals[0].trim() === ''
      ? { ok: false, message: 'prompt argument is empty' }
      : { ok: true, prompt: positionals[0] };
  }

  if (promptFile !== undefined) {
    let prompt: string;
    try {
      prompt = await readFile(path.resolve(processCwd, promptFile), 'utf8');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `cannot read prompt file "${promptFile}": ${reason}` };
    }
    return prompt.trim() === ''
      ? { ok: false, message: `prompt file "${promptFile}" is empty` }
      : { ok: true, prompt };
  }

  return { ok: true, prompt: stdinText };
}

export async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
