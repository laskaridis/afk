import { describe, expect, it } from 'vitest';
import { buildCodexArgs } from '../src/codex-args.js';

describe('buildCodexArgs', () => {
  it('starts a fresh session with automatic review and reads the prompt from stdin', () => {
    expect(buildCodexArgs({ cwd: '/w', outputFile: '/t/out.txt' })).toEqual([
      'exec', '--approve-for-me', '--cd', '/w', '--output-last-message', '/t/out.txt', '-',
    ]);
  });

  it('overrides only the model when supplied', () => {
    expect(buildCodexArgs({ cwd: '/w', outputFile: '/t/out.txt', model: 'gpt-x' })).toEqual([
      'exec', '--approve-for-me', '--cd', '/w', '--model', 'gpt-x',
      '--output-last-message', '/t/out.txt', '-',
    ]);
  });

  it('overrides only the reasoning effort when supplied', () => {
    expect(buildCodexArgs({ cwd: '/w', outputFile: '/t/out.txt', reasoningEffort: 'high' })).toEqual([
      'exec', '--approve-for-me', '--cd', '/w', '--config', 'model_reasoning_effort="high"',
      '--output-last-message', '/t/out.txt', '-',
    ]);
  });

  it('passes both overrides in the specified order', () => {
    expect(buildCodexArgs({ cwd: '/w', outputFile: '/t/out.txt', model: 'gpt-x', reasoningEffort: 'high' })).toEqual([
      'exec', '--approve-for-me', '--cd', '/w', '--model', 'gpt-x',
      '--config', 'model_reasoning_effort="high"', '--output-last-message', '/t/out.txt', '-',
    ]);
  });

  it('does not add unsupported or permission-broadening options', () => {
    const args = buildCodexArgs({ cwd: '/w', outputFile: '/t/out.txt', model: 'gpt-x', reasoningEffort: 'high' });
    expect(args).not.toContain('resume');
    expect(args).not.toContain('fork');
    expect(args).not.toContain('--json');
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).not.toContain('--worktree');
  });
});
