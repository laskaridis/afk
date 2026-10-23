import { describe, expect, it } from 'vitest';
import { buildSessionPrompt, HARNESS_INSTRUCTIONS } from '../src/session-prompt.js';

describe('buildSessionPrompt', () => {
  it('appends the fixed harness instructions after the unchanged launch prompt', () => {
    const launchPrompt = 'Implement specs/x.md\nKeep this line exactly.';

    expect(buildSessionPrompt(launchPrompt)).toBe(`${launchPrompt}\n\n${HARNESS_INSTRUCTIONS}`);
  });

  it('uses the same instructions for every call with the same prompt', () => {
    expect(buildSessionPrompt('Implement specs/x.md')).toBe(buildSessionPrompt('Implement specs/x.md'));
  });
});

describe('HARNESS_INSTRUCTIONS', () => {
  it('is self-contained: carries the workflow and response protocol without referring to an external skill', () => {
    expect(HARNESS_INSTRUCTIONS).toMatch(/^---\nInstructions from the afk harness:/);
    expect(HARNESS_INSTRUCTIONS).toContain('exactly one task');
    expect(HARNESS_INSTRUCTIONS).toContain('Nobody is available to answer questions');
    for (const shape of [
      '{"outcome":"repeat"}',
      '{"outcome":"complete"}',
      '{"outcome":"blocked","blocker_text":"..."}',
      '{"outcome":"fail","failure_summary":"..."}',
    ]) {
      expect(HARNESS_INSTRUCTIONS).toContain(shape);
    }
    for (const rule of [
      'nothing else',
      'do not wrap it in markdown fences',
      'must not include any additional fields',
    ]) {
      expect(HARNESS_INSTRUCTIONS.toLowerCase()).toContain(rule);
    }
    expect(HARNESS_INSTRUCTIONS).not.toMatch(/code skill/i);
  });
});
