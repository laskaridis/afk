export const HARNESS_INSTRUCTIONS = [
  '---',
  'Instructions from the afk harness:',
  '- Use the `code` skill to implement exactly one task for the feature described above.',
  '- Follow the code skill\'s coding loop response protocol: your final message must be exactly one JSON object with an "outcome" of "repeat", "complete", "blocked", or "fail", with no other text.',
  '- Nobody is available to answer questions or approve actions during this session.',
].join('\n');

export function buildSessionPrompt(launchPrompt: string): string {
  return `${launchPrompt}\n\n${HARNESS_INSTRUCTIONS}`;
}
