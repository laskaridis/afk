#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const stateDir = process.env.FAKE_CODEX_STATE_DIR;
if (!stateDir) throw new Error('FAKE_CODEX_STATE_DIR is required');

const steps = JSON.parse(await readFile(path.join(stateDir, 'steps.json'), 'utf8'));
let count = 0;
try {
  count = Number(await readFile(path.join(stateDir, 'count'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const callNumber = count + 1;
await writeFile(path.join(stateDir, 'count'), String(callNumber));
const step = steps[Math.min(callNumber - 1, steps.length - 1)];
if (!step) throw new Error('At least one step is required');

let stdin = '';
for await (const chunk of process.stdin) stdin += chunk;
const argv = process.argv.slice(2);
await writeFile(path.join(stateDir, `call-${callNumber}.json`), JSON.stringify({
  argv, stdin, cwd: process.cwd(), pid: process.pid,
}));

if (typeof step.stdout === 'string') process.stdout.write(step.stdout);
if (step.ignoreSigint === true) process.on('SIGINT', () => {});
if (typeof step.sleepMs === 'number') await new Promise(resolve => setTimeout(resolve, step.sleepMs));
if (typeof step.finalMessage === 'string') {
  const index = argv.indexOf('--output-last-message');
  if (index < 0 || !argv[index + 1]) throw new Error('Missing output path');
  await writeFile(argv[index + 1], step.finalMessage);
}
process.exit(step.exitCode ?? 0);
