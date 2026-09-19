import { z } from 'zod';
const expected = z.unknown().refine(v => v !== undefined, 'expected 정답이 필요합니다.');
export const criteriaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_exact'), expected: z.string().min(1, '정답을 입력해 주세요.').max(100000) }).strict(),
  z.object({ type: z.literal('json_exact'), expected }).strict(),
  z.object({ type: z.literal('python'), functionName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/), cases: z.array(z.object({ args: z.array(expected).max(20), expected }).strict()).min(1).max(10) }).strict(),
]);
export type Criteria = z.infer<typeof criteriaSchema>;
export function parseCriteria(type: Criteria['type'], text: string): Criteria {
  if (type === 'text_exact') return criteriaSchema.parse({ type, expected: text });
  const value: unknown = JSON.parse(text);
  return criteriaSchema.parse(type === 'json_exact' ? { type, expected: value } : { ...(value as object), type });
}
export const gradeSchema = z.object({ status: z.literal('GRADED'), kind: z.literal('MEASURED'), method: z.string(), score: z.number().min(0).max(100), passed: z.number().int(), total: z.number().int().positive(), checks: z.array(z.object({ name: z.string(), passed: z.boolean(), actual: z.unknown().optional(), error: z.string().optional() })), outputHash: z.string(), criteriaHash: z.string(), gradedAt: z.string(), scope: z.string() });
export type Grade = z.infer<typeof gradeSchema>;
