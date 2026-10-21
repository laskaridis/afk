export function createStderrTail(limit = 20): { push(chunk: string): void; lines(): string[] } {
  const complete: string[] = [];
  let partial = '';

  return {
    push(chunk) {
      let start = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] !== '\n') continue;
        let line = partial + chunk.slice(start, index);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        complete.push(line);
        if (complete.length > limit) complete.shift();
        partial = '';
        start = index + 1;
      }
      partial += chunk.slice(start);
    },
    lines() {
      return (partial === '' ? complete : [...complete, partial]).slice(-limit);
    },
  };
}
