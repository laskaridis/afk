import type { AgentAdapter } from './types.js';

const invalidOutput = { kind: 'invalid', reason: 'agent output could not be parsed' } as const;

export const claudeAdapter: AgentAdapter = {
  name: 'claude',
  executable: 'claude',

  buildArgs({ model, effort }) {
    return [
      '-p',
      '--output-format',
      'json',
      '--permission-mode',
      'auto',
      ...(model === undefined ? [] : ['--model', model]),
      ...(effort === undefined ? [] : ['--effort', effort]),
    ];
  },

  extractFinalMessage(stdout) {
    if (stdout.trim() === '') return { kind: 'missing' };

    let value: unknown;
    try {
      value = JSON.parse(stdout);
    } catch {
      return invalidOutput;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return invalidOutput;
    }

    const response = value as Record<string, unknown>;
    if (response.is_error === true) {
      const subtype = response.subtype;
      return {
        kind: 'failed',
        reason:
          typeof subtype === 'string' && subtype.trim() !== ''
            ? `Claude reported an error (subtype: ${subtype})`
            : 'Claude reported an error',
      };
    }

    const result = response.result;
    return typeof result === 'string' && result.trim() !== '' ? { kind: 'message', text: result } : { kind: 'missing' };
  },
};
