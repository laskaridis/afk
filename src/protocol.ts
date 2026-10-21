export type ProtocolResponse =
  | { outcome: 'repeat' }
  | { outcome: 'complete' }
  | { outcome: 'blocked'; blockerText: string }
  | { outcome: 'fail'; failureSummary: string };

export type ParseResponseResult =
  | { ok: true; response: ProtocolResponse }
  | { ok: false; reason: string };

export function parseProtocolResponse(text: string): ParseResponseResult {
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return { ok: false, reason: 'final response is not valid JSON' };
  }

  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    return { ok: false, reason: 'final response is not a JSON object' };
  }

  const fields = value as Record<string, unknown>;
  switch (fields.outcome) {
    case 'repeat':
    case 'complete':
      if (Object.keys(fields).length !== 1) {
        return { ok: false, reason: `"${fields.outcome}" response must not include additional fields` };
      }
      return { ok: true, response: { outcome: fields.outcome } };
    case 'blocked':
      if (typeof fields.blocker_text !== 'string' || fields.blocker_text.trim() === '') {
        return { ok: false, reason: '"blocked" response requires a non-empty "blocker_text" string' };
      }
      return { ok: true, response: { outcome: 'blocked', blockerText: fields.blocker_text } };
    case 'fail':
      if (typeof fields.failure_summary !== 'string' || fields.failure_summary.trim() === '') {
        return { ok: false, reason: '"fail" response requires a non-empty "failure_summary" string' };
      }
      return { ok: true, response: { outcome: 'fail', failureSummary: fields.failure_summary } };
    default:
      return { ok: false, reason: '"outcome" must be one of repeat, complete, blocked, fail' };
  }
}
