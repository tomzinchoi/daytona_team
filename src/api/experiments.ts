import { z } from 'zod';
import type { ArchitecturesResponse, Workload } from '../../benchmark-engine/src/shared/types';
import { adaptEngineScreening } from './services';
import { snapshotSchema, type Configuration, type Snapshot } from '../domain';

const recordSchema = z.object({ id: z.string(), status: z.enum(['QUEUED', 'PROVISIONING', 'PREPARING', 'RUNNING', 'EVALUATING', 'COMPLETED', 'FAILED']), result: z.object({ runId: z.string(), provenance: z.object({ snapshotId: z.string().nullable() }) }).passthrough().nullable() });
const experimentSchema = z.object({
  id: z.string(), phase: z.enum(['search', 'benchmark', 'results']),
  workload: z.object({ description: z.string(), cases: z.array(z.object({ id: z.string() }).passthrough()), qualityPolicy: z.object({ testWeight: z.number(), buildWeight: z.number(), taskWeight: z.number() }).passthrough() }).passthrough(),
  screening: z.object({ candidateArchitectures: z.array(z.unknown()), screenedArchitectures: z.array(z.unknown()) }).passthrough(),
  runs: z.array(z.object({ architectureId: z.string(), caseId: z.string(), record: recordSchema })),
  results: z.array(z.object({ id: z.string(), kind: z.literal('MEASURED'), architecture: z.object({ id: z.string(), compute: z.object({ requestedMemoryMb: z.number() }).passthrough() }).passthrough(), workloadFingerprint: z.string(), measuredAt: z.string(), succeeded: z.boolean(), metrics: z.object({ kind: z.literal('MEASURED'), latencyMs: z.number().finite().nonnegative(), quality: z.object({ score: z.number().min(0).max(1), testPassRate: z.number(), buildSuccessRate: z.number(), taskSuccessRate: z.number(), rationale: z.array(z.string()), evidence: z.array(z.object({ tests: z.object({ passed: z.number(), failed: z.number(), skipped: z.number() }) }).passthrough()) }), resource: z.object({ peakMemoryMb: z.number().positive().nullable(), measurementContext: z.string() }).passthrough() }) }).passthrough()),
  recommendation: z.object({ paretoFrontier: z.array(z.object({ architecture: z.object({ id: z.string() }) })), performance: z.object({ architectureId: z.string() }).nullable(), balanced: z.object({ architectureId: z.string() }).nullable(), efficient: z.object({ architectureId: z.string() }).nullable(), warnings: z.array(z.string()) }).passthrough().nullable(),
  failures: z.record(z.string()), warnings: z.array(z.string()),
});
export function adaptExperiment(raw: unknown): Snapshot {
  const experiment = experimentSchema.parse(raw);
  const base = adaptEngineScreening(experiment.workload as unknown as Workload, experiment.screening as unknown as ArchitecturesResponse);
  const requestedAxis = experiment.results.some(result => result.metrics.resource.peakMemoryMb === null);
  const recommendations = (['performance', 'balanced', 'efficient'] as const).flatMap(category => {
    const result = experiment.recommendation?.[category];
    return result ? [{ category, configurationId: result.architectureId }] : [];
  });
  const configurations = base.configurations.map((config): Configuration => {
    const runs = experiment.runs.filter(run => run.architectureId === config.id);
    const active = runs.find(run => !run.record.result);
    const progress = { completed: runs.filter(run => run.record.result).length, total: experiment.workload.cases.length, currentCase: active?.caseId ?? null };
    const result = experiment.results.find(result => result.architecture.id === config.id);
    if (!result) return { ...config, progress, status: experiment.failures[config.id] ? 'failed' : active ? active.record.status === 'PREPARING' ? 'provisioning' : active.record.status.toLowerCase() as Configuration['status'] : 'queued', error: experiment.failures[config.id] };
    const quality = result.metrics.quality;
    const policy = experiment.workload.qualityPolicy;
    return {
      ...config, evidence: 'measured', quality: Math.round(quality.score * 1000) / 10,
      latency: Math.round(result.metrics.latencyMs / 100) / 10,
      resource: requestedAxis ? { value: result.architecture.compute.requestedMemoryMb / 1024, unit: 'GiB 요청 RAM', estimated: true, basis: 'requested' } : { value: result.metrics.resource.peakMemoryMb!, unit: 'MiB peak RSS', estimated: false, basis: 'measured' },
      tests: { passed: quality.evidence.reduce((n, e) => n + e.tests.passed, 0), total: quality.evidence.reduce((n, e) => n + e.tests.passed + e.tests.failed + e.tests.skipped, 0) },
      breakdown: [{ label: '신뢰된 테스트 통과율', value: quality.testPassRate * 100, weight: policy.testWeight }, { label: '구문 검사 통과율', value: quality.buildSuccessRate * 100, weight: policy.buildWeight }, { label: '전체 작업 성공률', value: quality.taskSuccessRate * 100, weight: policy.taskWeight }],
      qualityExplanation: quality.rationale.join(' '),
      status: result.succeeded ? 'completed' : 'failed', progress,
      pareto: experiment.recommendation?.paretoFrontier.some(r => r.architecture.id === config.id) ?? false,
      recommendation: recommendations.find(r => r.configurationId === config.id)?.category ?? null,
      provenance: { resultId: result.id, workloadFingerprint: result.workloadFingerprint, measuredAt: result.measuredAt, runIds: runs.flatMap(run => run.record.result ? [run.record.result.runId] : []), snapshotId: runs[0]?.record.result?.provenance.snapshotId ?? null, measurementContext: result.metrics.resource.measurementContext },
    };
  });
  return snapshotSchema.parse({ ...base, id: experiment.id, integration: 'runtime-workload', phase: experiment.phase, configurations, recommendations, warnings: [...experiment.warnings, ...(experiment.recommendation?.warnings ?? []), ...Object.values(experiment.failures)], resourceAxis: requestedAxis ? '요청 RAM (GiB) · 실제 사용량 아님' : '추론 프로세스 최대 RSS (MiB) · 실측', protocol: 'Daytona 고정 스냅샷 · 동일 CPU/RAM·시간·토큰 제한 · 전체 케이스 순차 실행. 품질은 엔진이 실제 build/test 근거로 계산. 지연 시간은 생성·모델 실행·평가·정리를 포함한 lifecycle 합계. 메모리는 Linux가 측정한 llama-server 자식 프로세스 peak RSS이며 할당 RAM 또는 비용이 아닙니다.' });
}
async function request(path: string, method = 'GET'): Promise<Snapshot> {
  const response = await fetch(`/runtime/api/workloads${path}`, { method, signal: AbortSignal.timeout(30000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `실측 워크로드 API 오류 (${response.status})`);
  return adaptExperiment(payload);
}
export const experimentApi = { create: () => request('/example', 'POST'), start: (id: string) => request(`/${encodeURIComponent(id)}/run`, 'POST'), get: (id: string) => request(`/${encodeURIComponent(id)}`) };
