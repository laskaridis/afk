import { describe, expect, it } from 'vitest';
import { HELP_TEXT } from '../src/help.js';

describe('HELP_TEXT', () => {
  it.each([
    '--agent <name>',
    '--prompt-file',
    '--cwd',
    '--max-iterations',
    '--session-timeout',
    '--model',
    '--reasoning-effort',
    '--help',
    '-h',
  ])('documents %s', option => {
    expect(HELP_TEXT).toContain(option);
  });

  it('shows usage and the exit codes', () => {
    expect(HELP_TEXT).toMatch(/^Usage: afk/);
    for (const code of ['0', '1', '2', '130']) expect(HELP_TEXT).toMatch(new RegExp(`^\\s+${code}\\s`, 'm'));
  });

  it('ends with a newline', () => {
    expect(HELP_TEXT.endsWith('\n')).toBe(true);
  });

  it('lists supported agents and the default without Codex-specific help wording', () => {
    expect(HELP_TEXT).toContain('codex, claude (default: codex)');
    expect(HELP_TEXT.replace('codex, claude', '').replace('(default: codex)', '')).not.toMatch(/codex/i);
    expect(HELP_TEXT).toContain('Run a coding agent unattended');
    expect(HELP_TEXT).toContain('Maximum number of agent session launches');
  });

  it('says model and reasoning effort pass through unchanged', () => {
    expect(HELP_TEXT).toMatch(/--model <model>\s+Model passed to the agent unchanged for every session/);
    expect(HELP_TEXT).toMatch(
      /--reasoning-effort <effort>\s+Reasoning effort passed to the agent unchanged for every session/,
    );
  });
});
