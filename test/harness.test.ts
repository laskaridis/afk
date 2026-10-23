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
});
