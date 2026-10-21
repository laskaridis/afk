import type { AgentAdapter } from './types.js';

export const codexAdapter: AgentAdapter = {
  name: 'codex',
  executable: 'codex',

  buildArgs({ cwd, model, effort }) {
    return [
      'exec',
      '--approve-for-me',
      '--cd', cwd,
      ...(model === undefined ? [] : ['--model', model]),
      ...(effort === undefined ? [] : ['--config', `model_reasoning_effort=${JSON.stringify(effort)}`]),
      '-',
    ];
  },

  extractFinalMessage(stdout) {
    return stdout.trim() === '' ? { kind: 'missing' } : { kind: 'message', text: stdout };
  },
};
