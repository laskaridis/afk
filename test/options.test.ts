import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOptions } from '../src/options.js';

describe('parseOptions', () => {
  it('uses the current directory and default session limit when no options are supplied', () => {
    expect(parseOptions([], process.cwd())).toEqual({
      ok: true,
      options: {
        positionals: [],
        promptFile: undefined,
        cwd: process.cwd(),
        model: undefined,
        reasoningEffort: undefined,
        maxIterations: 10,
        sessionTimeoutSeconds: undefined,
      },
    });
  });

  it('passes supported options and positionals through with validated values', () => {
    const result = parseOptions([
      '--prompt-file', 'feature.txt', '--model', 'gpt-x', '--reasoning-effort', 'high',
      '--max-iterations', '3', '--session-timeout', '30', 'Implement feature',
    ], process.cwd());

    expect(result).toEqual({
      ok: true,
      options: {
        positionals: ['Implement feature'],
        promptFile: 'feature.txt',
        cwd: process.cwd(),
        model: 'gpt-x',
        reasoningEffort: 'high',
        maxIterations: 3,
        sessionTimeoutSeconds: 30,
      },
    });
  });

  it('keeps a dash-leading prompt positional after --', () => {
    const result = parseOptions(['--', '--prompt-like-text', '--max-iterations', '-1'], process.cwd());
    expect(result.ok && result.options.positionals).toEqual(['--prompt-like-text', '--max-iterations', '-1']);
  });

  it('resolves a relative existing working directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'afk-options-'));
    try {
      const result = parseOptions(['--cwd', path.basename(workspace)], path.dirname(workspace));
      expect(result.ok && result.options.cwd).toBe(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it.each(['--unknown-flag', '--model'])('rejects unsupported or incomplete option %s', (arg) => {
    const result = parseOptions([arg], process.cwd());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });

  it.each(['0', '-1', '1.5', 'abc', '', '9007199254740992'])('rejects invalid iteration limit %j', (value) => {
    expect(parseOptions(['--max-iterations', value], process.cwd())).toEqual({
      ok: false,
      message: `--max-iterations must be a positive integer, got "${value}"`,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', '', '9007199254740992'])('rejects invalid timeout %j', (value) => {
    expect(parseOptions(['--session-timeout', value], process.cwd())).toEqual({
      ok: false,
      message: `--session-timeout must be a positive integer number of seconds, got "${value}"`,
    });
  });

  it.each([
    { option: '--model', message: '--model must not be empty' },
    { option: '--reasoning-effort', message: '--reasoning-effort must not be empty' },
  ])('rejects empty %s values', ({ option, message }) => {
    for (const value of ['', '  ']) {
      expect(parseOptions([option, value], process.cwd())).toEqual({ ok: false, message });
    }
  });

  it('rejects a missing or non-directory working directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'afk-options-'));
    const file = path.join(workspace, 'file.txt');
    writeFileSync(file, 'content');
    try {
      for (const value of [file, path.join(workspace, 'missing')]) {
        expect(parseOptions(['--cwd', value], process.cwd())).toEqual({
          ok: false,
          message: `--cwd "${value}" is not an existing directory`,
        });
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
