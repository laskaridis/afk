import { describe, expect, it } from 'vitest';
import { parseProtocolResponse } from '../src/protocol.js';

describe('parseProtocolResponse', () => {
  it('accepts a repeat response with surrounding whitespace', () => {
    expect(parseProtocolResponse('  {"outcome":"repeat"}\n')).toEqual({
      ok: true,
      response: { outcome: 'repeat' },
    });
  });

  it('accepts a complete response', () => {
    expect(parseProtocolResponse('{"outcome":"complete"}')).toEqual({
      ok: true,
      response: { outcome: 'complete' },
    });
  });

  it('accepts a blocked response and preserves the original blocker text', () => {
    expect(parseProtocolResponse(' \n{"outcome":"blocked","blocker_text":" need creds ","detail":1}\n')).toEqual({
      ok: true,
      response: { outcome: 'blocked', blockerText: ' need creds ' },
    });
  });

  it('accepts a fail response and preserves the original failure summary', () => {
    expect(parseProtocolResponse('{"outcome":"fail","failure_summary":" tests red ","detail":1}')).toEqual({
      ok: true,
      response: { outcome: 'fail', failureSummary: ' tests red ' },
    });
  });

  it.each([
    ['', 'final response is not valid JSON'],
    ['before {"outcome":"repeat"}', 'final response is not valid JSON'],
    ['{"outcome":"repeat"} after', 'final response is not valid JSON'],
    ['```json\n{"outcome":"repeat"}\n```', 'final response is not valid JSON'],
    ['{"outcome":"repeat"}{"outcome":"complete"}', 'final response is not valid JSON'],
    ['[]', 'final response is not a JSON object'],
    ['"repeat"', 'final response is not a JSON object'],
    ['null', 'final response is not a JSON object'],
    ['{}', '"outcome" must be one of repeat, complete, blocked, fail'],
    ['{"outcome":"retry"}', '"outcome" must be one of repeat, complete, blocked, fail'],
    ['{"outcome":"repeat","extra":1}', '"repeat" response must not include additional fields'],
    ['{"outcome":"complete","extra":1}', '"complete" response must not include additional fields'],
    ['{"outcome":"blocked"}', '"blocked" response requires a non-empty "blocker_text" string'],
    ['{"outcome":"blocked","blocker_text":""}', '"blocked" response requires a non-empty "blocker_text" string'],
    ['{"outcome":"blocked","blocker_text":"  \\n"}', '"blocked" response requires a non-empty "blocker_text" string'],
    ['{"outcome":"blocked","blocker_text":12}', '"blocked" response requires a non-empty "blocker_text" string'],
    ['{"outcome":"fail"}', '"fail" response requires a non-empty "failure_summary" string'],
    ['{"outcome":"fail","failure_summary":""}', '"fail" response requires a non-empty "failure_summary" string'],
    ['{"outcome":"fail","failure_summary":"  "}', '"fail" response requires a non-empty "failure_summary" string'],
    ['{"outcome":"fail","failure_summary":12}', '"fail" response requires a non-empty "failure_summary" string'],
  ])('rejects invalid final response %j', (text, reason) => {
    expect(parseProtocolResponse(text)).toEqual({ ok: false, reason });
  });
});
