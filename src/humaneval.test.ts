import { describe, expect, it } from 'vitest';
import text from '../backend/results_live.jsonl?raw';
import { parseHumanEval, summarizeHumanEval } from './humaneval';

describe('teammate HumanEval result contract', () => {
  it('aggregates the actual 12 records without replacing a timeout with zero latency or tokens', () => {
    const rows = parseHumanEval(text);
    const summary = summarizeHumanEval(rows);
    expect(rows).toHaveLength(12);
    expect(summary.comparable).toBe(true);
    expect(summary.models.map(m => m.passed)).toEqual([4, 3, 4]);
    const qwen = summary.models.find(m => m.id === 'qwen3.5-9b')!;
    expect(qwen.passRate).toBe(75);
    expect(qwen.averageMs).toBeCloseTo((4837 + 4128 + 8755) / 3);
    expect(qwen.averageTokens).toBeCloseTo((187 + 170 + 545) / 3);
    expect(qwen.responseCount).toBe(3);
    expect(summary.duration).toBe(34.7);
  });
  it('keeps missing telemetry null when every model request failed', () => {
    const failed = parseHumanEval(text).find(r => r.time_ms === null)!;
    const summary = summarizeHumanEval([failed]);
    expect(summary.models[0].averageMs).toBeNull();
    expect(summary.models[0].averageTokens).toBeNull();
    expect(summary.models[0].passRate).toBe(0);
    expect(summary.comparable).toBe(false);
  });
  it('flags unequal model workloads and never hides a missing case', () => {
    const summary = summarizeHumanEval(parseHumanEval(text).slice(1));
    expect(summary.comparable).toBe(false);
    expect(summary.models[0].missing).toEqual(['HumanEval/53']);
  });
  it('rejects mixed repeated runs, malformed JSON, invalid numbers, and contradictory evidence', () => {
    const first = parseHumanEval(text)[0];
    expect(() => parseHumanEval(text + JSON.stringify(first))).toThrow('중복');
    expect(() => parseHumanEval('{')).toThrow('JSON');
    for (const change of [{ tokens: -1 }, { end_s: -1 }, { end_s: 0, start_s: 1 }, { time_ms: null }, { code: '' }, { error: 'failed' }]) {
      expect(() => parseHumanEval(JSON.stringify({ ...first, ...change }))).toThrow();
    }
    expect(() => parseHumanEval('')).toThrow();
    expect(() => parseHumanEval(' '.repeat(1024 * 1024 + 1))).toThrow('1MB');
  });
  it('accepts CRLF and UTF-8 BOM files and preserves zero measured tokens', () => {
    const row = { ...parseHumanEval(text)[0], tokens: 0 };
    const summary = summarizeHumanEval(parseHumanEval('\uFEFF' + JSON.stringify(row) + '\r\n'));
    expect(summary.models[0].averageTokens).toBe(0);
  });
});
