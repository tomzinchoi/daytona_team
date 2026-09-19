import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Daytona } from '@daytona/sdk';
const problems = JSON.parse(await readFile('../backend/humaneval_all.json', 'utf8'));
const models = JSON.parse(await readFile('../backend/live-models.json', 'utf8'));
const supported = ['HumanEval/53', 'HumanEval/23', 'HumanEval/45', 'HumanEval/7'];
const jobs = new Map(); let active = false;
const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, otelEnabled: false });
const digest = value => createHash('sha256').update(value).digest();
async function execute(job, ids) {
  let sandbox;
  try {
    sandbox = await daytona.create({ language: 'python', public: false, networkBlockAll: true, autoStopInterval: 10, autoDeleteInterval: 0, ttlMinutes: 15 }, { timeout: 90 });
    job.status = 'running';
    for (const [model, config] of Object.entries(models)) for (const id of ids) {
      const problem = problems.find(p => p.task_id === id);
      const row = { model, task_id: id, passed: false, time_ms: null, tokens: null, error: null };
      try {
        const start = Date.now();
        // Vercel performs model inference; this host only orchestrates and grades.
        // Direct connections from the Daytona host to Nosana are reset upstream.
        const response = await fetch('https://daytona-team.vercel.app/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: model, workload: 'Complete this Python function. Return only the complete function code, without explanations.\n\n' + problem.prompt }), signal: AbortSignal.timeout(55000) });
        if (!response.ok) throw new Error('Model HTTP ' + response.status);
        const result = await response.json(); row.time_ms = result.elapsedMs ?? Date.now() - start; row.tokens = result.completionTokens ?? null;
        let code = (result.output || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        code = code.match(/```(?:python)?\s*\n([\s\S]*?)```/)?.[1] ?? code;
        const target = 'def ' + problem.entry_point;
        code = code.includes(target) ? problem.prompt.slice(0, problem.prompt.indexOf(target)) + '\n' + code : problem.prompt + code;
        const grading = await fetch('https://daytona-team.vercel.app/api/grade', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.RUNTIME_API_TOKEN }, body: JSON.stringify({ sandboxId: sandbox.id, taskId: id, code }), signal: AbortSignal.timeout(45000) });
        if (!grading.ok) throw new Error('Isolated grading HTTP ' + grading.status);
        const evaluation = await grading.json();
        row.passed = evaluation.passed === true;
        if (!row.passed) row.error = 'Python tests failed or timed out';
      } catch (error) { row.error = error.name === 'TimeoutError' ? 'Model response timed out' : String(error.message || 'Execution failed').replaceAll(process.env.DAYTONA_API_KEY, '[redacted]').slice(0, 240); }
      job.rows.push(row);
    }
    job.status = 'cleaning';
  } catch { job.status = 'failed'; job.error = 'Daytona sandbox preparation failed'; }
  finally { if (sandbox) try { await sandbox.delete(60, true); job.cleanup = 'deleted'; } catch { job.cleanup = 'failed'; } if (job.status === 'cleaning') job.status = 'completed'; active = false; }
}
http.createServer(async (request, response) => {
  const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
  if (!timingSafeEqual(digest(request.headers.authorization || ''), digest('Bearer ' + process.env.RUNTIME_API_TOKEN))) return send(401, { error: 'Unauthorized' });
  const path = new URL(request.url, 'http://local').pathname;
  if (request.method === 'GET' && path === '/health') return send(200, { active });
  if (request.method === 'GET') { const job = jobs.get(path.split('/')[2]); return send(job ? 200 : 404, job ?? { error: 'Unknown run' }); }
  if (request.method !== 'POST' || path !== '/runs') return send(404, { error: 'Unknown route' });
  if (active) return send(409, { error: '이미 실행 중입니다. 완료 후 다시 시도하세요.', run: [...jobs.values()].find(job => !['completed', 'failed'].includes(job.status)) });
  try {
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 100000) return send(413, { error: 'Input too large' }); }
    const ids = JSON.parse(raw || '{}').taskIds ?? supported;
    if (!Array.isArray(ids) || !ids.length || ids.length > 4 || ids.some(id => !supported.includes(id)) || new Set(ids).size !== ids.length) return send(400, { error: '지원하는 네 HumanEval 문제만 선택하세요.' });
    if (jobs.size >= 100) jobs.delete(jobs.keys().next().value);
    const job = { id: randomUUID(), status: 'provisioning', total: ids.length * 3, rows: [], protocol: { maxOutputTokens: 2048, temperature: 0, modelTimeoutSeconds: 50, evaluatorTimeoutSeconds: 12, comparison: 'New run only; different settings from recorded HumanEval results.' } };
    active = true; jobs.set(job.id, job); send(202, job); void execute(job, ids);
  } catch { send(400, { error: 'Invalid JSON' }); }
}).listen(3003, '0.0.0.0');
