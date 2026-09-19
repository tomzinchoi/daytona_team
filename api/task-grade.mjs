import { ZodError } from 'zod';
import { gradeTask } from '../backend/task-grading.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.method !== 'POST') return send(405, { error: { message: 'POST 요청만 지원합니다.' } });
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: { message: '이 사이트에서 채점해 주세요.' } }); }
    catch { return send(403, { error: { message: '잘못된 요청 출처입니다.' } }); }
  }
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw) > 512 * 1024) return send(413, { error: { message: '채점 입력이 너무 큽니다.' } });
    return send(200, await gradeTask(JSON.parse(raw)));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return send(400, { error: { message: '정답 또는 테스트 JSON 형식을 확인해 주세요.' } });
    return send(503, { error: { message: '채점 환경을 완료하지 못했습니다. 생성 결과는 보존됩니다. 잠시 후 채점만 다시 시도해 주세요.' } });
  }
}
