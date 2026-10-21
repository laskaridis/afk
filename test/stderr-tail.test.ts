import { describe, expect, it } from 'vitest';
import { createStderrTail } from '../src/stderr-tail.js';

describe('createStderrTail', () => {
  it('keeps only the last 20 lines', () => {
    const tail = createStderrTail();
    tail.push(Array.from({ length: 25 }, (_, index) => `l${index + 1}`).join('\n') + '\n');
    expect(tail.lines()).toEqual(Array.from({ length: 20 }, (_, index) => `l${index + 6}`));
  });

  it('joins a line across chunks and includes a non-empty trailing partial line', () => {
    const tail = createStderrTail();
    tail.push('ab');
    expect(tail.lines()).toEqual(['ab']);
    tail.push('c\n');
    expect(tail.lines()).toEqual(['abc']);
  });

  it('keeps interior blank lines and strips carriage returns at line endings', () => {
    const tail = createStderrTail();
    tail.push('first\r\n\nlast\r');
    tail.push('\n');
    expect(tail.lines()).toEqual(['first', '', 'last']);
  });

  it('counts a trailing partial line within the limit and returns a snapshot', () => {
    const tail = createStderrTail(2);
    tail.push('one\ntwo\nthree');
    const snapshot = tail.lines();
    expect(snapshot).toEqual(['two', 'three']);
    tail.push(' more\n');
    expect(snapshot).toEqual(['two', 'three']);
    expect(tail.lines()).toEqual(['two', 'three more']);
  });
});
