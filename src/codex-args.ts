export interface CodexArgsInput {
  cwd: string;
  outputFile: string;
  model?: string;
  reasoningEffort?: string;
}

export function buildCodexArgs(input: CodexArgsInput): string[] {
  return [
    'exec',
    '--approve-for-me',
    '--cd', input.cwd,
    ...(input.model === undefined ? [] : ['--model', input.model]),
    ...(input.reasoningEffort === undefined ? [] : ['--config', `model_reasoning_effort=${JSON.stringify(input.reasoningEffort)}`]),
    '--output-last-message', input.outputFile,
    '-',
  ];
}
