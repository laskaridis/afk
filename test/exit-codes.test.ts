import { describe, expect, it } from 'vitest';
import { EXIT_CODES } from '../src/exit-codes.js';

describe('CLI exit codes', () => {
  it('exposes the statuses used for success, failure, usage errors, and interruption', () => {
    expect(EXIT_CODES).toEqual({
      success: 0,
      failure: 1,
      usageError: 2,
      interrupted: 130,
    });
  });
});
