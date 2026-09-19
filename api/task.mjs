import { executeTask } from '../backend/task-service.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') return send(405, { error: { message: 'POST 요청만 지원합니다.' } });
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: { message: '이 사이트에서 작업을 실행해 주세요.' } }); }
    catch { return send(403, { error: { message: '잘못된 요청 출처입니다.' } }); }
  }
  try {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    if (Buffer.byteLength(raw) > 512 * 1024) return send(413, { error: { message: '작업 파일과 설명의 크기가 너무 큽니다.' } });
    let body; try { body = JSON.parse(raw); } catch { return send(400, { error: { message: '올바른 JSON 요청이 필요합니다.' } }); }
    return send(200, await executeTask(body));
  } catch (error) { return send(error.status ?? 502, { error: { message: error.status ? error.message : '작업 실행 결과를 읽을 수 없습니다.' } }); }
}
