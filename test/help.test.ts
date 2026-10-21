import { describe, expect, it } from 'vitest';
import { HELP_TEXT } from '../src/help.js';

describe('HELP_TEXT', () => {
  it.each([
    '--prompt-file', '--cwd', '--max-iterations', '--session-timeout',
    '--model', '--reasoning-effort', '--help', '-h',
  ])('documents %s', (option) => {
    expect(HELP_TEXT).toContain(option);
  });

  it('shows usage and the exit codes', () => {
    expect(HELP_TEXT).toMatch(/^Usage: afk/);
    for (const code of ['0', '1', '2', '130']) expect(HELP_TEXT).toMatch(new RegExp(`^\\s+${code}\\s`, 'm'));
  });

  it('ends with a newline', () => {
    expect(HELP_TEXT.endsWith('\n')).toBe(true);
  });
});
