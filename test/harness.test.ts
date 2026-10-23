import { describe, expect, it } from 'vitest';
import { agentNames } from '../src/agents/index.js';
import { AGENT_FIXTURES, runAgentScenario } from './helpers/agent-fixtures.js';

const start = '[afk] Iteration 1/10: starting agent session';
const retry = '[afk] Iteration 2/10: retrying after execution error';
const next = '[afk] Iteration 2/10: starting agent session';
const complete = '[afk] Run complete: the code skill reported feature completion.';

const scenarios = [
  {
    name: 'repeat then complete',
    steps: [{ finalMessage: '{"outcome":"repeat"}' }, { finalMessage: '{"outcome":"complete"}' }],
    exitCode: 0,
    lines: [start, next, complete],
    calls: 2,
  },
  {
    name: 'blocked response',
    steps: [{ finalMessage: '{"outcome":"blocked","blocker_text":"Provide tasks"}' }],
    exitCode: 1,
    lines: [start, '[afk] Run blocked: Provide tasks'],
    calls: 1,
  },
  {
    name: 'task failure then complete',
    steps: [{ finalMessage: '{"outcome":"fail","failure_summary":"Tests failed"}' }, { finalMessage: '{"outcome":"complete"}' }],
    exitCode: 0,
    lines: [start, '[afk] Task failed: Tests failed', next, complete],
    calls: 2,
  },
  {
    name: 'invalid protocol text',
    steps: [{ finalMessage: 'Done.' }],
    exitCode: 1,
    lines: [start, '[afk] Execution error: agent final response is invalid: final response is not valid JSON', retry,
      '[afk] Execution error: agent final response is invalid: final response is not valid JSON',
      '[afk] Run stopped after a repeated execution error: agent final response is invalid: final response is not valid JSON'],
    calls: 2,
  },
  {
    name: 'empty stdout',
    steps: [{}],
    exitCode: 1,
    lines: [start, '[afk] Execution error: agent exited without a final response', retry,
      '[afk] Execution error: agent exited without a final response',
      '[afk] Run stopped after a repeated execution error: agent exited without a final response'],
    calls: 2,
  },
];

it('has a fake executable for every registered agent', () => {
  expect(Object.keys(AGENT_FIXTURES).sort()).toEqual(agentNames().sort());
});

describe.each(agentNames())('%s harness protocol outcomes', agentName => {
  it.each(scenarios)('$name', async scenario => {
    const actual = await runAgentScenario(agentName, scenario.steps);
    const codex = await runAgentScenario('codex', scenario.steps);

    expect(actual.exitCode).toBe(scenario.exitCode);
    expect(actual.stderrLines).toEqual(scenario.lines);
    expect(actual.calls).toHaveLength(scenario.calls);
    expect(actual.stdout).toBe('');
    expect({ exitCode: actual.exitCode, stderrLines: actual.stderrLines })
      .toEqual({ exitCode: codex.exitCode, stderrLines: codex.stderrLines });
  });

  it.each([
    {
      name: 'retries a failed launch and completes',
      steps: [{ exitCode: 3 }, { finalMessage: '{"outcome":"complete"}' }],
      args: [],
      exitCode: 0,
      lines: [start, '[afk] Execution error: agent exited unsuccessfully with exit code 3', retry, complete],
      calls: 2,
    },
    {
      name: 'stops after two consecutive execution errors',
      steps: [{ exitCode: 1 }],
      args: [],
      exitCode: 1,
      lines: [start, '[afk] Execution error: agent exited unsuccessfully with exit code 1', retry,
        '[afk] Execution error: agent exited unsuccessfully with exit code 1',
        '[afk] Run stopped after a repeated execution error: agent exited unsuccessfully with exit code 1'],
      calls: 2,
    },
    {
      name: 'stops at the iteration limit',
      steps: [{ finalMessage: '{"outcome":"repeat"}' }],
      args: ['--max-iterations', '2'],
      exitCode: 1,
      lines: ['[afk] Iteration 1/2: starting agent session', '[afk] Iteration 2/2: starting agent session',
        '[afk] Run stopped: reached the iteration limit of 2 without reported completion.'],
      calls: 2,
    },
    {
      name: 'stops without retrying after a timeout',
      steps: [{ sleepMs: 3000, finalMessage: '{"outcome":"complete"}' }],
      args: ['--session-timeout', '1'],
      exitCode: 1,
      lines: [start, '[afk] Run stopped: agent session timed out after 1 seconds.'],
      calls: 1,
    },
  ])('$name', async scenario => {
    const actual = await runAgentScenario(agentName, scenario.steps, scenario.args);
    const codex = await runAgentScenario('codex', scenario.steps, scenario.args);

    expect(actual.exitCode).toBe(scenario.exitCode);
    expect(actual.stderrLines).toEqual(scenario.lines);
    expect(actual.calls).toHaveLength(scenario.calls);
    expect({ exitCode: actual.exitCode, stderrLines: actual.stderrLines })
      .toEqual({ exitCode: codex.exitCode, stderrLines: codex.stderrLines });
  });

  it('stops without retrying after interruption', async () => {
    async function interruptedRun(name: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        return await runAgentScenario(name, [{ sleepMs: 3000, finalMessage: '{"outcome":"complete"}' }],
          [], { abortSignal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    const actual = await interruptedRun(agentName);
    const codex = await interruptedRun('codex');

    expect(actual.exitCode).toBe(130);
    expect(actual.stderrLines).toEqual([start, '[afk] Run interrupted by user.']);
    expect(actual.calls).toHaveLength(1);
    expect({ exitCode: actual.exitCode, stderrLines: actual.stderrLines })
      .toEqual({ exitCode: codex.exitCode, stderrLines: codex.stderrLines });
  });

  it.each([
    {
      name: 'prints stderr immediately after an execution error',
      steps: [{ stderr: 'boom\n', exitCode: 3 }, { finalMessage: '{"outcome":"complete"}' }],
      args: [],
      lines: [start, '[afk] Execution error: agent exited unsuccessfully with exit code 3',
        'boom', retry, complete],
      exitCode: 0,
      calls: 2,
    },
    {
      name: 'prints only the last 20 stderr lines',
      steps: [{ stderr: Array.from({ length: 25 }, (_, index) => `l${index + 1}`).join('\n') + '\n', exitCode: 3 },
        { finalMessage: '{"outcome":"complete"}' }],
      args: [],
      lines: [start, '[afk] Execution error: agent exited unsuccessfully with exit code 3',
        ...Array.from({ length: 20 }, (_, index) => `l${index + 6}`), retry, complete],
      exitCode: 0,
      calls: 2,
    },
    {
      name: 'hides stderr from a successful session',
      steps: [{ stderr: 'noise\n', finalMessage: '{"outcome":"complete"}' }],
      args: [],
      lines: [start, complete],
      exitCode: 0,
      calls: 1,
    },
    {
      name: 'hides stderr from a timed-out session',
      steps: [{ stderr: 'noise\n', sleepMs: 3000 }],
      args: ['--session-timeout', '1'],
      lines: [start, '[afk] Run stopped: agent session timed out after 1 seconds.'],
      exitCode: 1,
      calls: 1,
    },
  ])('$name', async scenario => {
    const actual = await runAgentScenario(agentName, scenario.steps, scenario.args);
    const codex = await runAgentScenario('codex', scenario.steps, scenario.args);

    expect(actual.exitCode).toBe(scenario.exitCode);
    expect(actual.stderrLines).toEqual(scenario.lines);
    expect(actual.calls).toHaveLength(scenario.calls);
    expect(actual.stdout).toBe('');
    expect({ exitCode: actual.exitCode, stderrLines: actual.stderrLines })
      .toEqual({ exitCode: codex.exitCode, stderrLines: codex.stderrLines });
  });

  it('hides stderr from an interrupted session', async () => {
    async function interruptedRun(name: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 500);
      try {
        return await runAgentScenario(name, [{ stderr: 'noise\n', sleepMs: 3000 }],
          [], { abortSignal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    const actual = await interruptedRun(agentName);
    const codex = await interruptedRun('codex');

    expect(actual.exitCode).toBe(130);
    expect(actual.stderrLines).toEqual([start, '[afk] Run interrupted by user.']);
    expect(actual.calls).toHaveLength(1);
    expect({ exitCode: actual.exitCode, stderrLines: actual.stderrLines })
      .toEqual({ exitCode: codex.exitCode, stderrLines: codex.stderrLines });
  });
});

describe('Claude result classification', () => {
  it.each([
    {
      name: 'reports a Claude error subtype',
      step: { claudeError: 'error_max_turns' },
      reason: 'agent exited unsuccessfully: Claude reported an error (subtype: error_max_turns)',
    },
    {
      name: 'reports malformed Claude JSON',
      step: { stdout: 'not json' },
      reason: 'agent final response is invalid: agent output could not be parsed',
    },
  ])('$name', async scenario => {
    const actual = await runAgentScenario('claude', [scenario.step, { finalMessage: '{"outcome":"complete"}' }]);

    expect(actual.exitCode).toBe(0);
    expect(actual.stderrLines).toEqual([
      start, `[afk] Execution error: ${scenario.reason}`, retry, complete,
    ]);
    expect(actual.calls).toHaveLength(2);
    expect(actual.stdout).toBe('');
  });
});
