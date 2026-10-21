#!/usr/bin/env node
import { main } from './main.js';

const controller = new AbortController();
const onSigint = () => controller.abort();
process.on('SIGINT', onSigint);

try {
  const code = await main(process.argv.slice(2), {
    stdin: process.stdin,
    stderr: process.stderr,
    processCwd: process.cwd(),
    abortSignal: controller.signal,
  });
  process.exitCode = code;
} finally {
  process.off('SIGINT', onSigint);
}
