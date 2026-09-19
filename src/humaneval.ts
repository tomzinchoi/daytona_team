import { z } from 'zod';
import { ACTIVE_MODEL_IDS, ACTIVE_MODELS } from './active-models';

export const MODEL_NAMES: Record<string, string> = Object.fromEntries(ACTIVE_MODELS.map(m => [m.id, m.name]));
const rowSchema = z.object({
  model: z.enum(ACTIVE_MODEL_IDS), task_id: z.string().regex(/^HumanEval\/\d+$/),
  passed: z.boolean(), time_ms: z.number().finite().nonnegative().nullable(),
  tokens: z.number().int().nonnegative().nullable(),
  start_s: z.number().finite().nonnegative(), end_s: z.number().finite().nonnegative(),
  code: z.string().max(100000).optional(), error: z.string().max(10000).nullable().optional(),
}).superRefine((r, ctx) => {
  if (r.end_s < r.start_s) ctx.addIssue({ code: 'custom', message: '종료 시간이 시작 시간보다 빠릅니다.' });
  if (r.passed && (r.time_ms === null || !r.code || r.error)) ctx.addIssue({ code: 'custom', message: '통과 기록의 코드·응답 시간·오류 필드를 확인하세요.' });
});
export type HumanEvalRow = z.infer<typeof rowSchema>;
export const MAX_RESULT_BYTES = 1024 * 1024;
export function parseHumanEval(text: string): HumanEvalRow[] {
  if (new TextEncoder().encode(text).length > MAX_RESULT_BYTES) throw new Error('결과 파일은 1MB 이하여야 합니다.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length || lines.length > 1000) throw new Error('1~1,000개의 JSONL 결과 행이 필요합니다.');
  const seen = new Set<string>();
  return lines.map((line, i) => {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { throw new Error(`${i + 1}번째 행의 JSON 형식이 잘못됐습니다.`); }
    if (raw && typeof raw === 'object' && 'model' in raw && !ACTIVE_MODEL_IDS.some(id => id === raw.model))
      throw new Error(`${i + 1}번째 행: 현재 데모는 gemma4-e2b, qwen3.5-9b, gpt-oss-20b만 지원합니다.`);
    const result = rowSchema.safeParse(raw);
    if (!result.success) throw new Error(`${i + 1}번째 행: 모델·문제·통과 여부·시간·토큰 필드를 확인하세요.`);
    const key = `${result.data.model}\0${result.data.task_id}`;
    if (seen.has(key)) throw new Error('같은 모델·문제의 중복 기록입니다. 한 번의 실행 결과만 불러오세요.');
    seen.add(key);
    return result.data;
  });
}
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function summarizeHumanEval(rows: HumanEvalRow[]) {
  const tasks = [...new Set(rows.map(r => r.task_id))];
  const models = [...new Set(rows.map(r => r.model))].map(id => {
    const results = rows.filter(r => r.model === id);
    const timed = results.flatMap(r => r.time_ms === null ? [] : [r.time_ms]);
    const tokenRows = results.flatMap(r => r.tokens === null ? [] : [r.tokens]);
    return {
      id, name: MODEL_NAMES[id] ?? id, rows: results,
      passed: results.filter(r => r.passed).length, total: results.length,
      passRate: results.filter(r => r.passed).length / results.length * 100,
      averageMs: mean(timed), responseCount: timed.length,
      averageTokens: mean(tokenRows), tokenCount: tokenRows.length,
      duration: Math.max(...results.map(r => r.end_s)) - Math.min(...results.map(r => r.start_s)),
      missing: tasks.filter(task => !results.some(r => r.task_id === task)),
    };
  });
  return { models, tasks, comparable: models.length > 1 && models.every(m => !m.missing.length), duration: Math.max(...rows.map(r => r.end_s), 0) };
}
