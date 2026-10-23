import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import type { AgentAdapter } from './types.js';

export type { AgentAdapter, FinalMessageResult } from './types.js';

export const AGENTS: Record<string, AgentAdapter> = {
  [codexAdapter.name]: codexAdapter,
  [claudeAdapter.name]: claudeAdapter,
};

export const DEFAULT_AGENT = 'codex';

export function agentNames(): string[] {
  return Object.keys(AGENTS);
}

export function getAgent(name: string): AgentAdapter | undefined {
  return Object.hasOwn(AGENTS, name) ? AGENTS[name] : undefined;
}
