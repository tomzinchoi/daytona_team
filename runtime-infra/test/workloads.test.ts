import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkloadExperiments, type EngineCall } from '../src/workloads.js';
import { BenchmarkJobs } from '../src/jobs.js';
import { emptyResult } from '../src/provenance.js';
import type { ComputeProvider } from '../src/providers/provider.js';
import { architecturesEndpoint, aggregateResultsEndpoint, recommendEndpoint } from '../../benchmark-engine/dist/api.js';
import { DEMO_WORKLOAD } from '../../benchmark-engine/dist/benchmark/demo.js';

const policy = { id: 'standard' as const, requestedCpuCores: 4, requestedMemoryMb: 8192, accelerator: 'CPU_ONLY' as const, maxOutputTokensPerAgent: 1024, timeoutMsPerCase: 300000, maxConcurrentCases: 1 as const, modelHosting: 'PROVIDER_MANAGED' as const };
async function setup(unavailable = false, memory = true) {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-workloads-'));
  const calls: string[] = []; let executions = 0;
  // Synthetic transport only, limited to this test. Scoring/aggregation use real engine functions.
  const provider: ComputeProvider = {
    id: 'daytona', async getStatus() { return { id: 'daytona', kind: 'compute', status: 'LIVE', reason: 'TEST DOUBLE', capabilities: {} }; }, getCapabilities() { return {}; }, async cleanup() {},
    async runBenchmark(request, context) {
      executions++; context.transition('RUNNING');
      const r = emptyResult(request, context.runId, 300, 1024);
      if (unavailable) { r.error = { code: 'RUNTIME_NOT_READY', message: 'Test-only missing model' }; return r; }
      r.measurement = 'MEASURED'; r.status = 'COMPLETED'; r.success = true;
      r.metrics.elapsedMs = 500; r.metrics.totalElapsedMs = 1000; r.metrics.memoryBytes = memory ? 256 * 1024 * 1024 : null;
      r.caseEvidence = { caseId: request.benchmarkCase.id, status: 'COMPLETED', buildSucceeded: true, tests: { passed: 4, failed: 0, skipped: 0 }, buildExitStatus: 0, testExitStatus: 0 };
      r.agents = request.architecture.agents.map(agent => ({ ...agent, elapsedMs: 100, output: 'TEST DOUBLE' }));
      Object.assign(r.provenance, { environmentHash: 'a'.repeat(64), snapshotId: 'test-snapshot', modelManifest: { source: 'TEST DOUBLE' }, resources: { cpu: 4, memory: 8, disk: 10 } });
      return r;
    },
  };
  const engine: EngineCall = async (path, body) => { calls.push(path); if (path.endsWith('demo-workload')) return { workload: DEMO_WORKLOAD }; if (path.endsWith('architectures')) return architecturesEndpoint(body); if (path.endsWith('aggregate')) return aggregateResultsEndpoint(body); return recommendEndpoint(body); };
  const jobs = new BenchmarkJobs({ daytona: provider, nosana: provider }, 300, 200, 1024);
  const experiments = new WorkloadExperiments(jobs, engine, async () => policy, directory);
  return { experiments, jobs, calls, directory, engine, count: () => executions, async close() { await experiments.close(); await jobs.close(); if (directory.startsWith(join(tmpdir(), 'atlas-workloads-'))) await rm(directory, { recursive: true, force: true }); } };
}
async function complete(experiments: WorkloadExperiments, id: string) {
  const deadline = Date.now() + 10000;
  while (experiments.get(id)?.phase !== 'results') { if (Date.now() > deadline) throw new Error('Experiment timeout'); await new Promise(resolve => setImmediate(resolve)); }
  await experiments.close(); return experiments.get(id)!;
}
test('Top 3 × all cases → real aggregation → recommendations, idempotent start and archive replay', async () => {
  const lab = await setup();
  try {
    const experiment = await lab.experiments.create();
    lab.experiments.start(experiment.id); lab.experiments.start(experiment.id);
    const result = await complete(lab.experiments, experiment.id);
    assert.equal(lab.count(), 9); assert.equal(result.results.length, 3); assert.equal(result.runs.length, 9);
    assert.equal(lab.calls.filter(path => path === '/api/results/aggregate').length, 3);
    assert.ok(result.recommendation?.performance); assert.ok(result.recommendation?.balanced); assert.ok(result.recommendation?.efficient);
    assert.equal(result.recommendation?.resourceMetric, 'peakMemoryMb');
    const restored = new WorkloadExperiments(lab.jobs, lab.engine, async () => policy, lab.directory);
    assert.equal(restored.get(experiment.id)?.results.length, 3);
    restored.start(experiment.id); assert.equal(lab.count(), 9);
  } finally { await lab.close(); }
});
test('infrastructure failures never reach aggregation or recommendation APIs', async () => {
  const lab = await setup(true);
  try { const e = await lab.experiments.create(); lab.experiments.start(e.id); const result = await complete(lab.experiments, e.id); assert.equal(result.results.length, 0); assert.equal(Object.keys(result.failures).length, 3); assert.ok(!lab.calls.some(path => path.includes('aggregate') || path.includes('recommend'))); }
  finally { await lab.close(); }
});
test('missing telemetry stays null and does not manufacture balanced/efficient picks', async () => {
  const lab = await setup(false, false);
  try { const e = await lab.experiments.create(); lab.experiments.start(e.id); const result = await complete(lab.experiments, e.id); assert.equal(result.recommendation?.resourceMetric, null); assert.ok(result.recommendation?.performance); assert.equal(result.recommendation?.balanced, null); assert.equal(result.recommendation?.efficient, null); }
  finally { await lab.close(); }
});
