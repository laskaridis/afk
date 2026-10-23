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
  it('directs the session to use the code skill for one task and its exact response protocol', () => {
    expect(HARNESS_INSTRUCTIONS).toBe(
      [
        '---',
        'Instructions from the afk harness:',
        '- Use the `code` skill to implement exactly one task for the feature described above.',
        '- Follow the code skill\'s coding loop response protocol: your final message must be exactly one JSON object with an "outcome" of "repeat", "complete", "blocked", or "fail", with no other text.',
        '- Nobody is available to answer questions or approve actions during this session.',
      ].join('\n'),
    );
  });
});
