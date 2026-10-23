import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { agentNames } from '../src/agents/index.js';
import { main } from '../src/main.js';
import { AGENT_FIXTURES } from './helpers/agent-fixtures.js';

describe.each(agentNames())('%s quiet runs', agentName => {
  it('leaves no files or agent output and prints only iteration and final status lines', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'afk-no-side-effects-test-'));
    const tempDir = path.join(root, 'temp');
    const workspace = path.join(root, 'workspace');
    const stateDir = path.join(root, 'state');
    const previousTmpdir = process.env.TMPDIR;
    const previousStateDir = process.env.FAKE_AGENT_STATE_DIR;

    try {
      await Promise.all([mkdir(tempDir), mkdir(workspace), mkdir(stateDir)]);
      await writeFile(
        path.join(stateDir, 'steps.json'),
        JSON.stringify([
          { sleepMs: 1500, stderr: 'AGENT-NOISE\n', finalMessage: '{"outcome":"repeat"}' },
          { stderr: 'AGENT-NOISE\n', finalMessage: '{"outcome":"complete"}' },
        ]),
      );
      process.env.TMPDIR = tempDir;
      process.env.FAKE_AGENT_STATE_DIR = stateDir;

      const stderr: string[] = [];
      const stdout: string[] = [];
      const exitCode = await main(['--agent', agentName, 'Prompt'], {
        stdin: Object.assign(Readable.from([]), { isTTY: true }),
        stdout: {
          write: chunk => {
            stdout.push(chunk);
          },
        },
        stderr: {
          write: chunk => {
            stderr.push(chunk);
          },
        },
        processCwd: workspace,
        launcher: { executable: process.execPath, leadingArgs: [AGENT_FIXTURES[agentName]] },
      });

      const stderrText = stderr.join('');
      const stdoutText = stdout.join('');
      const stderrLines = stderrText.trimEnd().split('\n');
      expect(exitCode).toBe(0);
      expect(await readdir(tempDir)).toEqual([]);
      expect(await readdir(workspace)).toEqual([]);
      expect(stderrLines).toEqual([
        '[afk] Iteration 1/10: starting agent session',
        '[afk] Iteration 2/10: starting agent session',
        '[afk] Run complete: the code skill reported feature completion.',
      ]);
      expect(stderrLines.every(line => line.startsWith('[afk] '))).toBe(true);
      expect(stdoutText).toBe('');
      expect(stderrText + stdoutText).not.toContain('AGENT-NOISE');
      expect(stderrText + stdoutText).not.toContain('"outcome"');
    } finally {
      if (previousTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmpdir;
      if (previousStateDir === undefined) delete process.env.FAKE_AGENT_STATE_DIR;
      else process.env.FAKE_AGENT_STATE_DIR = previousStateDir;
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);
});
