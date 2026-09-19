import { createNosanaClient } from '../nosana-connection/client.mjs';

const routes = [
  ['engine', 'GET', /^\/api\/(demo-workload|model-profiles)$/],
  ['engine', 'POST', /^\/api\/(architectures|recommend|results\/aggregate)$/],
  ['runtime', 'GET', /^\/api\/(providers|benchmark\/policy)$/],
  ['runtime', 'GET', /^\/api\/(workloads|benchmark\/(runs|batches))\/[a-f0-9-]{36}$/],
  ['runtime', 'POST', /^\/api\/workloads(?:\/example|\/[a-f0-9-]{36}\/run)?$/],
  ['runtime', 'POST', /^\/api\/benchmark\/(run|engine\/run|batch|readiness)$/],
];
let nosanaCache;
async function nosanaStatus() {
  if (nosanaCache && nosanaCache.until > Date.now()) return nosanaCache.report;
  let report;
  try {
    const client = await createNosanaClient({ apiKey: process.env.NOSANA_API_KEY, timeoutMs: 8000 });
    const models = await client.listModels();
    if (!Array.isArray(models.data)) throw new Error('Invalid model catalog');
    report = { id: 'nosana', kind: 'compute', status: 'LIVE', capabilities: { inferenceApi: true, benchmark: false, gpuExecution: false }, reason: `Nosana 추론 API 인증 확인 (${models.data.length}개 모델). 벤치마크 실행 어댑터는 아직 연결되지 않았습니다.` };
  } catch {
    report = { id: 'nosana', kind: 'compute', status: process.env.NOSANA_API_KEY ? 'ERROR' : 'NOT_CONFIGURED', capabilities: { inferenceApi: false, benchmark: false }, reason: 'Nosana 추론 API 인증 또는 모델 목록 조회를 확인하지 못했습니다.' };
  }
  nosanaCache = { until: Date.now() + 30000, report };
  return report;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, body) => { response.statusCode = status; response.end(JSON.stringify(body)); };
  const url = new URL(request.url, 'https://atlas.invalid');
  // Read original route when invoked directly; rewrites carry a fixed service/path.
  const original = url.pathname.match(/^\/(engine|runtime)(\/api\/.*)$/);
  const service = original?.[1] ?? url.searchParams.get('service');
  const path = original?.[2] ?? `/api/${url.searchParams.get('path') || ''}`;
  if (!routes.some(([s, method, pattern]) => s === service && method === request.method && pattern.test(path))) {
    return send(404, { error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
  }
  // Reject cross-site writes before forwarding the server credential.
  if (request.method === 'POST' && request.headers.origin) {
    try { if (new URL(request.headers.origin).host !== request.headers.host) return send(403, { error: { code: 'ORIGIN_REJECTED', message: 'Use this site to submit a benchmark.' } }); }
    catch { return send(403, { error: { code: 'ORIGIN_REJECTED', message: 'Invalid origin.' } }); }
  }
  const base = service === 'engine' ? process.env.ENGINE_API_URL : process.env.RUNTIME_API_URL;
  if (!base) return send(503, { error: { code: 'BACKEND_NOT_CONFIGURED', message: '배포 서버 주소가 설정되지 않았습니다.' } });
  try {
    const target = new URL(path, base);
    if (target.protocol !== 'https:') throw new Error('HTTPS backend required');
    const headers = { 'Content-Type': 'application/json', 'X-Daytona-Skip-Preview-Warning': 'true' };
    const previewToken = service === 'engine' ? process.env.ENGINE_PREVIEW_TOKEN : process.env.RUNTIME_PREVIEW_TOKEN;
    if (previewToken) headers['X-Daytona-Preview-Token'] = previewToken;
    if (service === 'runtime') headers.Authorization = `Bearer ${process.env.RUNTIME_API_TOKEN || ''}`;
    let body;
    if (request.method === 'POST') {
      body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
      if (Buffer.byteLength(body) > 256 * 1024) return send(413, { error: { code: 'BODY_TOO_LARGE', message: '워크로드 크기가 제한을 초과했습니다.' } });
    }
    // Async job submission only: never keep model inference inside this function.
    const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(55000) });
    if (!(upstream.headers.get('content-type') || '').includes('application/json')) throw new Error('Invalid upstream response');
    const payload = await upstream.json();
    if (service === 'runtime' && path === '/api/providers' && upstream.ok && Array.isArray(payload.providers)) {
      const nosana = await nosanaStatus();
      payload.providers = payload.providers.map(p => p.id === 'nosana' ? nosana : p);
    }
    return send(upstream.status, payload);
  } catch {
    return send(502, { error: { code: 'BACKEND_UNAVAILABLE', message: '실행 서버에 연결하지 못했습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.' } });
  }
}
