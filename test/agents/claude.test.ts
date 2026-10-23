import { describe, expect, it } from 'vitest';
import { claudeAdapter } from '../../src/agents/claude.js';

describe('claudeAdapter', () => {
  it('launches Claude in print mode with JSON output and auto permissions', () => {
    expect(claudeAdapter.name).toBe('claude');
    expect(claudeAdapter.executable).toBe('claude');
    expect(claudeAdapter.buildArgs({ cwd: '/w' })).toEqual([
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      'auto',
    ]);
    expect(claudeAdapter.buildArgs({ cwd: '/w' })).not.toContain('bypassPermissions');
  });

  it('passes model and effort overrides unchanged', () => {
    expect(claudeAdapter.buildArgs({ cwd: '/w', model: 'm', effort: 'high' })).toEqual([
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      'auto',
      '--model',
      'm',
      '--effort',
      'high',
    ]);
  });

  it('preserves explicitly supplied empty overrides for the caller to validate', () => {
    expect(claudeAdapter.buildArgs({ cwd: '/w', model: '', effort: '' })).toEqual([
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      'auto',
      '--model',
      '',
      '--effort',
      '',
    ]);
  });

  it('reports empty stdout as a missing response', () => {
    expect(claudeAdapter.extractFinalMessage('')).toEqual({ kind: 'missing' });
    expect(claudeAdapter.extractFinalMessage(' \n ')).toEqual({ kind: 'missing' });
  });

  it('reports unparseable or non-object JSON as invalid agent output', () => {
    for (const stdout of ['not json', '[]', 'null', '"x"']) {
      expect(claudeAdapter.extractFinalMessage(stdout)).toEqual({
        kind: 'invalid',
        reason: 'agent output could not be parsed',
      });
    }
  });

  it('reports Claude errors before inspecting the result text', () => {
    expect(claudeAdapter.extractFinalMessage('{"is_error":true,"subtype":"error_max_turns","result":"x"}')).toEqual({
      kind: 'failed',
      reason: 'Claude reported an error (subtype: error_max_turns)',
    });
    expect(claudeAdapter.extractFinalMessage('{"is_error":true,"result":""}')).toEqual({
      kind: 'failed',
      reason: 'Claude reported an error',
    });
    expect(claudeAdapter.extractFinalMessage('{"is_error":true,"subtype":"  "}')).toEqual({
      kind: 'failed',
      reason: 'Claude reported an error',
    });
  });

  it('reports absent, non-string or blank result text as missing', () => {
    for (const stdout of ['{}', '{"result":""}', JSON.stringify({ result: ' \n ' }), '{"result":3}']) {
      expect(claudeAdapter.extractFinalMessage(stdout)).toEqual({ kind: 'missing' });
    }
  });

  it('returns Claude result text unchanged for protocol parsing', () => {
    const result = '{"outcome":"complete"}';
    expect(claudeAdapter.extractFinalMessage(JSON.stringify({ is_error: false, result }))).toEqual({
      kind: 'message',
      text: result,
    });
  });
});
