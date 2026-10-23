import { describe, expect, it } from 'vitest';
import { claudeAdapter } from '../../src/agents/claude.js';
import { codexAdapter } from '../../src/agents/codex.js';
import { AGENTS, DEFAULT_AGENT, agentNames, getAgent } from '../../src/agents/index.js';
import type { AgentAdapter, FinalMessageResult } from '../../src/agents/index.js';

describe('agent registry', () => {
  it('lists built-in agents in the supported order and resolves each adapter', () => {
    expect(agentNames()).toEqual(['codex', 'claude']);
    expect(getAgent('codex')).toBe(codexAdapter);
    expect(getAgent('claude')).toBe(claudeAdapter);
  });

  it('defaults to a registered Codex adapter', () => {
    expect(DEFAULT_AGENT).toBe('codex');
    expect(getAgent(DEFAULT_AGENT)).toBe(codexAdapter);
  });

  it('rejects unsupported names and inherited object properties', () => {
    for (const name of ['nope', '', 'toString', '__proto__']) {
      expect(getAgent(name)).toBeUndefined();
    }
  });

  it('uses each adapter name as its registry key', () => {
    for (const [name, adapter] of Object.entries(AGENTS)) {
      expect(adapter.name).toBe(name);
    }
  });

  it('exports the adapter contracts', () => {
    const adapter: AgentAdapter = getAgent(DEFAULT_AGENT)!;
    const result: FinalMessageResult = adapter.extractFinalMessage('');
    expect(result).toEqual({ kind: 'missing' });
  });
});
