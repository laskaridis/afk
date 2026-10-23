import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStream, resolvePrompt, type PromptStdin } from '../src/prompt.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

function stdin(text: string, isTTY = false): PromptStdin {
  return { isTTY, read: async () => text };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'afk-prompt-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('resolvePrompt', () => {
  it('uses a single positional prompt unchanged without reading TTY stdin', async () => {
    const read = vi.fn(async () => 'ignored');

    const result = await resolvePrompt({
      positionals: ['build it'],
      processCwd: process.cwd(),
      stdin: { isTTY: true, read },
    });

    expect(result).toEqual({ ok: true, prompt: 'build it' });
    expect(read).not.toHaveBeenCalled();
  });

  it('reads a relative prompt file from the launch directory', async () => {
    const processCwd = await temporaryDirectory();
    await writeFile(path.join(processCwd, 'prompt.txt'), 'from file');

    const result = await resolvePrompt({ positionals: [], promptFile: 'prompt.txt', processCwd, stdin: stdin('') });

    expect(result).toEqual({ ok: true, prompt: 'from file' });
  });

  it('uses non-empty piped stdin unchanged and reads it once', async () => {
    const read = vi.fn(async () => '  from stdin\n');

    const result = await resolvePrompt({ positionals: [], processCwd: process.cwd(), stdin: { isTTY: false, read } });

    expect(result).toEqual({ ok: true, prompt: '  from stdin\n' });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('rejects a positional and non-empty stdin as multiple sources', async () => {
    const result = await resolvePrompt({
      positionals: ['build it'],
      processCwd: process.cwd(),
      stdin: stdin('from stdin'),
    });

    expect(result).toEqual({
      ok: false,
      message:
        'multiple prompt sources provided (prompt argument, stdin); use exactly one of a prompt argument, --prompt-file, or stdin',
    });
  });

  it('rejects a positional and prompt file as multiple sources', async () => {
    const result = await resolvePrompt({
      positionals: ['build it'],
      promptFile: 'prompt.txt',
      processCwd: process.cwd(),
      stdin: stdin(''),
    });

    expect(result).toEqual({
      ok: false,
      message:
        'multiple prompt sources provided (prompt argument, --prompt-file); use exactly one of a prompt argument, --prompt-file, or stdin',
    });
  });

  it.each([true, false])('rejects missing input with isTTY=%s', async isTTY => {
    const result = await resolvePrompt({ positionals: [], processCwd: process.cwd(), stdin: stdin('  \n', isTTY) });

    expect(result).toEqual({
      ok: false,
      message: 'no prompt provided; pass a prompt argument, --prompt-file <path>, or pipe the prompt on stdin',
    });
  });

  it('rejects an empty positional', async () => {
    const result = await resolvePrompt({ positionals: [' \n'], processCwd: process.cwd(), stdin: stdin('', true) });

    expect(result).toEqual({ ok: false, message: 'prompt argument is empty' });
  });

  it('rejects an empty prompt file', async () => {
    const processCwd = await temporaryDirectory();
    await writeFile(path.join(processCwd, 'empty.txt'), ' \n');

    const result = await resolvePrompt({ positionals: [], promptFile: 'empty.txt', processCwd, stdin: stdin('') });

    expect(result).toEqual({ ok: false, message: 'prompt file "empty.txt" is empty' });
  });

  it('reports an unreadable prompt file', async () => {
    const processCwd = await temporaryDirectory();
    const promptFile = 'missing.txt';

    const result = await resolvePrompt({ positionals: [], promptFile, processCwd, stdin: stdin('') });

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/^cannot read prompt file "missing\.txt": .*ENOENT/);
  });

  it('rejects two positional arguments before reading stdin', async () => {
    const read = vi.fn(async () => 'from stdin');

    const result = await resolvePrompt({
      positionals: ['one', 'two'],
      processCwd: process.cwd(),
      stdin: { isTTY: false, read },
    });

    expect(result).toEqual({
      ok: false,
      message: 'expected a single prompt argument but received 2; quote the prompt',
    });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('readStream', () => {
  it('concatenates chunks and decodes them as UTF-8', async () => {
    const result = await readStream(Readable.from([Buffer.from([0xc3]), Buffer.from([0xa9]), ' abc']));

    expect(result).toBe('é abc');
  });
});
