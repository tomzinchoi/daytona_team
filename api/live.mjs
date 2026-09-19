export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (!process.env.LIVE_API_URL) return send(503, { error: 'LIVE_NOT_CONFIGURED', message: 'HumanEval 새 실행 서버 연결을 준비 중입니다. 저장된 결과와 새 실행은 별개입니다.' });
  if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'METHOD_NOT_ALLOWED' });
  const id = new URL(req.url, 'https://local').searchParams.get('id');
  if (id && !/^[a-f0-9-]{36}$/.test(id)) return send(400, { error: 'INVALID_ID' });
  if (req.method === 'GET' && !id) return send(400, { error: 'ID_REQUIRED' });
  try {
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'INVALID_ORIGIN' });
    const upstream = await fetch(`${process.env.LIVE_API_URL}/runs${id ? '/' + id : ''}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${process.env.RUNTIME_API_TOKEN}`, 'X-Daytona-Preview-Token': process.env.RUNTIME_PREVIEW_TOKEN, 'Content-Type': 'application/json' },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body ?? {}) } : {}),
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    return send(upstream.status, await upstream.json());
  } catch { return send(502, { error: 'LIVE_UNAVAILABLE', message: '새 실행 서버에 연결하지 못했습니다.' }); }
}
