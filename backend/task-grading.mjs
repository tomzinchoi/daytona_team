import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { Daytona } from '@daytona/sdk';

const json = z.unknown().refine(value => value !== undefined, 'expected is required');
export const criteriaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text_exact'), expected: z.string().min(1).max(100000) }).strict(),
  z.object({ type: z.literal('json_exact'), expected: json }).strict(),
  z.object({ type: z.literal('python'), functionName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/), cases: z.array(z.object({ args: z.array(json).max(20), expected: json }).strict()).min(1).max(10) }).strict(),
]);
export const gradeInputSchema = z.object({ output: z.string().min(1).max(100000), criteria: criteriaSchema }).strict();
const unfence = value => value.trim().match(/^```(?:python|json)?\s*\n([\s\S]*?)\n```\s*$/)?.[1] ?? value.trim();
function summarize(output, criteria, checks, extra = {}) {
  const passed = checks.filter(c => c.passed).length;
  return { status: 'GRADED', kind: 'MEASURED', method: criteria.type, score: passed / checks.length * 100, passed, total: checks.length, checks,
    outputHash: createHash('sha256').update(output).digest('hex'), criteriaHash: createHash('sha256').update(JSON.stringify(criteria)).digest('hex'),
    gradedAt: new Date().toISOString(), scope: '사용자가 제공한 정답·테스트에 대한 통과율이며 일반적인 품질 점수가 아닙니다.', ...extra };
}

// The trusted parent never runs candidate code. Each case runs in a new child
// in a network-blocked ephemeral sandbox. Expected answers stay on this server.
const pythonRunner = `import json, subprocess, sys, tempfile, os
from pathlib import Path
root = Path(__file__).parent
config = json.loads((root / 'input.json').read_text())
child = """import json, sys, resource, contextlib, io
resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
resource.setrlimit(resource.RLIMIT_AS, (268435456, 268435456))
resource.setrlimit(resource.RLIMIT_FSIZE, (131072, 131072))
payload = json.loads(sys.stdin.read())
scope = {'__name__': 'candidate'}
with open('/dev/null', 'w') as sink, contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
    exec(compile(payload['code'], '<candidate>', 'exec'), scope)
    result = scope[payload['functionName']](*payload['args'])
with open(sys.argv[1], 'w') as target:
    json.dump(result, target, allow_nan=False)
"""
code = (root / 'solution.py').read_text()
results = []
try:
    compile(code, '<candidate>', 'exec')
except SyntaxError:
    results = [{'error': 'Python 구문 오류'} for _ in config['cases']]
for case in ([] if results else config['cases']):
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'result.json'
        try:
            run = subprocess.run([sys.executable, '-I', '-c', child, str(path)], input=json.dumps({'code':code, 'functionName':config['functionName'], 'args':case['args']}), text=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2.5, cwd=folder)
            if run.returncode != 0: raise ValueError('실행 오류 또는 자원 제한 초과')
            if not path.exists() or path.stat().st_size > 100000: raise ValueError('JSON으로 반환할 수 없는 결과')
            results.append({'actual':json.loads(path.read_text())})
        except subprocess.TimeoutExpired: results.append({'error':'테스트 시간 초과 (2.5초)'})
        except Exception as error: results.append({'error':str(error)[:100]})
print(json.dumps(results, ensure_ascii=False, allow_nan=False))
`;

export async function runPython(output, criteria, client = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, otelEnabled: false })) {
  let sandbox; let cleanup = 'NOT_CREATED';
  try {
    sandbox = await client.create({ language: 'python', public: false, networkBlockAll: true, autoStopInterval: 5, autoDeleteInterval: 0, ttlMinutes: 10 }, { timeout: 25 });
    const root = `/tmp/atlas-grade-${randomUUID()}`;
    await sandbox.fs.createFolder(root, '700');
    await Promise.all([
      sandbox.fs.uploadFile(Buffer.from(pythonRunner), `${root}/grade.py`),
      sandbox.fs.uploadFile(Buffer.from(unfence(output)), `${root}/solution.py`),
      sandbox.fs.uploadFile(Buffer.from(JSON.stringify({ functionName: criteria.functionName, cases: criteria.cases.map(c => ({ args: c.args })) })), `${root}/input.json`),
    ]);
    const execution = await sandbox.process.executeCommand(`timeout 28s python3 -I ${root}/grade.py`, undefined, undefined, 30);
    if (execution.exitCode !== 0) throw new Error('채점 환경의 실행 시간이 초과되었거나 실행에 실패했습니다.');
    const rows = JSON.parse(execution.result.trim());
    if (!Array.isArray(rows) || rows.length !== criteria.cases.length) throw new Error('채점 결과가 완전하지 않습니다.');
    return { rows, sandboxId: sandbox.id };
  } finally {
    if (sandbox) { try { await sandbox.delete(8, true); cleanup = 'DELETED'; } catch { cleanup = 'TTL_PENDING'; } }
    await client[Symbol.asyncDispose]();
    // TTL is a backup; deletion failures must be visible in server logs.
    if (cleanup === 'TTL_PENDING') console.error('Task grading sandbox cleanup pending TTL:', sandbox.id);
  }
}
export async function gradeTask(raw, python = runPython) {
  const { output, criteria } = gradeInputSchema.parse(raw);
  if (criteria.type === 'text_exact') return summarize(output, criteria, [{ name: '정답 일치 (앞뒤 공백 제외)', passed: output.trim() === criteria.expected.trim(), actual: output }]);
  if (criteria.type === 'json_exact') {
    try { const actual = JSON.parse(unfence(output)); return summarize(output, criteria, [{ name: 'JSON 구조와 값 일치', passed: isDeepStrictEqual(actual, criteria.expected), actual }]); }
    catch { return summarize(output, criteria, [{ name: '유효한 JSON', passed: false, error: '응답이 올바른 JSON이 아닙니다.' }]); }
  }
  const result = await python(output, criteria);
  return summarize(output, criteria, result.rows.map((row, i) => ({ name: `테스트 ${i + 1}`, passed: !row.error && Object.hasOwn(row, 'actual') && isDeepStrictEqual(row.actual, criteria.cases[i].expected), ...row })), { provider: 'Daytona', sandboxId: result.sandboxId });
}

export { pythonRunner };
