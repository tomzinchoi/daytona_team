import { describe, expect, it } from 'vitest';
import { architecturesEndpoint } from '../../benchmark-engine/src/api';
import { DEMO_WORKLOAD } from '../../benchmark-engine/src/benchmark/demo';
import { plottableConfigurations } from '../domain';
import { adaptExperiment } from './experiments';

function fixture(memory: number | null = 512) {
  const screening = architecturesEndpoint({ workload: DEMO_WORKLOAD });
  const architecture = screening.screenedArchitectures[0].architecture;
  return { id: 'test-experiment', phase: 'results', workload: DEMO_WORKLOAD, screening,
    runs: [{ architectureId: architecture.id, caseId: 'case-1', record: { id: 'test-run', status: 'COMPLETED', result: { runId: 'test-run', provenance: { snapshotId: 'test-snapshot' } } } }],
    results: [{ id: 'test-result', kind: 'MEASURED', architecture, workloadFingerprint: 'test-fingerprint', measuredAt: '2026-09-19T00:00:00Z', succeeded: true,
      metrics: { kind: 'MEASURED', latencyMs: 1500, quality: { score: 1, testPassRate: 1, buildSuccessRate: 1, taskSuccessRate: 1, rationale: ['Test fixture'], evidence: [{ tests: { passed: 12, failed: 0, skipped: 0 } }] }, resource: { peakMemoryMb: memory, measurementContext: 'TEST ONLY' } } }],
    recommendation: { paretoFrontier: [{ architecture }], performance: { architectureId: architecture.id }, balanced: null, efficient: null, warnings: [] }, failures: {}, warnings: [] };
}
describe('runtime workload integration boundary', () => {
  it('replaces only completed measured results, retaining provenance and units', () => {
    const snapshot = adaptExperiment(fixture());
    const plotted = plottableConfigurations(snapshot.configurations, snapshot.source);
    expect(plotted).toHaveLength(1);
    expect(plotted[0]).toMatchObject({ evidence: 'measured', latency: 1.5, quality: 100, tests: { passed: 12, total: 12 }, resource: { value: 512, unit: 'MiB peak RSS', estimated: false }, provenance: { runIds: ['test-run'], snapshotId: 'test-snapshot' } });
    expect(snapshot.recommendations).toHaveLength(1);
  });
  it('labels requested RAM honestly when actual RSS is unavailable', () => {
    const snapshot = adaptExperiment(fixture(null));
    const measured = snapshot.configurations.find(c => c.evidence === 'measured')!;
    expect(measured.resource).toMatchObject({ basis: 'requested', estimated: true, unit: 'GiB 요청 RAM' });
    expect(snapshot.resourceAxis).toContain('실제 사용량 아님');
    expect(snapshot.recommendations?.some(r => r.category === 'efficient')).toBe(false);
  });
  it('rejects contradictory measured quality instead of displaying it', () => {
    const data = fixture(); data.results[0].metrics.quality.score = 0.5;
    expect(() => adaptExperiment(data)).toThrow('Quality must match');
  });
});
