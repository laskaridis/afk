import { describe, expect, it } from 'vitest';
import { codexAdapter } from '../../src/agents/codex.js';

describe('codexAdapter', () => {
  it('starts a fresh Codex session with automatic approval review and stdin prompt', () => {
    expect(codexAdapter.name).toBe('codex');
    expect(codexAdapter.executable).toBe('codex');
    expect(codexAdapter.buildArgs({ cwd: '/w' })).toEqual(['exec', '--approve-for-me', '--cd', '/w', '-']);
  });

  it('passes model and reasoning effort overrides unchanged in the existing order', () => {
    expect(codexAdapter.buildArgs({ cwd: '/w', model: 'm', effort: 'high' })).toEqual([
      'exec',
      '--approve-for-me',
      '--cd',
      '/w',
      '--model',
      'm',
      '--config',
      'model_reasoning_effort="high"',
      '-',
    ]);
  });

  it('includes an explicitly supplied empty override', () => {
    expect(codexAdapter.buildArgs({ cwd: '/w', model: '', effort: '' })).toEqual([
      'exec',
      '--approve-for-me',
      '--cd',
      '/w',
      '--model',
      '',
      '--config',
      'model_reasoning_effort=""',
      '-',
    ]);
  });

  it('does not request a final-message output file', () => {
    expect(codexAdapter.buildArgs({ cwd: '/w' })).not.toContain('--output-last-message');
    expect(codexAdapter.buildArgs({ cwd: '/w', model: 'm', effort: 'high' })).not.toContain('--output-last-message');
  });

  it('reports empty or whitespace-only stdout as a missing response', () => {
    expect(codexAdapter.extractFinalMessage('')).toEqual({ kind: 'missing' });
    expect(codexAdapter.extractFinalMessage('  \n')).toEqual({ kind: 'missing' });
  });

  it('returns the final message without changing its text', () => {
    const stdout = '{"outcome":"complete"}\n';
    expect(codexAdapter.extractFinalMessage(stdout)).toEqual({ kind: 'message', text: stdout });
  });
});
