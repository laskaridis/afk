import { readFileSync } from 'node:fs';

export const HARNESS_INSTRUCTIONS = readFileSync(new URL('./harness.md', import.meta.url), 'utf8').trimEnd();

export function buildSessionPrompt(launchPrompt: string): string {
  return `${launchPrompt}\n\n${HARNESS_INSTRUCTIONS}`;
}
