export const MAX_LINE_LENGTH = 8192;

export function createStderrTail(limit = 20): { push(chunk: string): void; lines(): string[] } {
  const complete: string[] = [];
  let partial = '';
  let pendingCarriageReturn = false;

  return {
    push(chunk) {
      let start = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] !== '\n') continue;
        let line = partial + (pendingCarriageReturn ? '\r' : '') + chunk.slice(start, index);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        complete.push(line.slice(-MAX_LINE_LENGTH));
        if (complete.length > limit) complete.shift();
        partial = '';
        pendingCarriageReturn = false;
        start = index + 1;
      }
      let trailing = partial + (pendingCarriageReturn ? '\r' : '') + chunk.slice(start);
      pendingCarriageReturn = trailing.endsWith('\r');
      if (pendingCarriageReturn) trailing = trailing.slice(0, -1);
      partial = trailing.slice(-MAX_LINE_LENGTH);
    },
    lines() {
      const unfinished = (partial + (pendingCarriageReturn ? '\r' : '')).slice(-MAX_LINE_LENGTH);
      return (unfinished === '' ? complete : [...complete, unfinished]).slice(-limit);
    },
  };
}
