import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { DaytonaProvider } from '../src/providers/daytona.js';
import { configured, labFixture, request } from './fixtures.js';
import type { RunStatus } from '../src/contracts.js';

test('without credentials no SDK client or measured result is fabricated', async () => {
  const provider = new DaytonaProvider(loadConfig({}), () => { throw new Error('SDK must not be called'); });
  assert.equal((await provider.getStatus()).status, 'NOT_CONFIGURED');
  const result = await provider.runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.measurement, 'NOT_AVAILABLE');
  assert.equal(result.metrics.elapsedMs, null);
  assert.equal(result.metrics.exitStatus, null);
  assert.equal(result.error?.code, 'PROVIDER_NOT_CONFIGURED');
});

test('SDK-backed lifecycle uploads fixture, executes, evaluates and confirms deletion', async () => {
  const fixture = labFixture(); const states: RunStatus[] = [];
  const provider = new DaytonaProvider(configured(), () => fixture.client);
  const result = await provider.runBenchmark(request, { runId: 'test', transition: s => states.push(s) });
  assert.deepEqual(states, ['PROVISIONING', 'PREPARING', 'RUNNING', 'EVALUATING']);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.measurement, 'MEASURED');
  assert.equal(result.metrics.elapsedMs, 125);
  assert.equal(result.metrics.exitStatus, 0);
  assert.equal(result.metrics.evaluatorExitStatus, 0);
  assert.equal(result.metrics.gpuUsagePercent, null);
  assert.equal(result.cleanup.status, 'DELETED');
  assert.equal(fixture.state.deletes, 1);
  assert.equal(fixture.state.options.snapshot, 'snapshot-id');
  assert.equal(fixture.state.options.networkBlockAll, true);
  assert.equal(fixture.state.options.envVars, undefined);
  assert.ok(!JSON.stringify(fixture.state.options).includes('unit-test-secret'));
  const payload = JSON.parse(fixture.uploads.get('/tmp/benchmark-lab/input.json')!.toString());
  assert.deepEqual(payload.benchmarkCase, request.benchmarkCase);
  assert.deepEqual(fixture.commands.map(x => x.timeout), [30, 310, 30]);
});

test('different architectures keep environment and fixture fingerprints constant', async () => {
  const fixture = labFixture();
  const provider = new DaytonaProvider(configured(), () => fixture.client);
  const a = await provider.runBenchmark(request, { runId: 'a', transition() {} });
  const next = structuredClone(request); next.architecture.id = 'second'; next.architecture.agents[0]!.role = 'Review.';
  const b = await provider.runBenchmark(next, { runId: 'b', transition() {} });
  assert.equal(a.provenance.environmentHash, b.provenance.environmentHash);
  assert.equal(a.provenance.fixtureHash, b.provenance.fixtureHash);
  assert.notEqual(a.provenance.architectureHash, b.provenance.architectureHash);
});

test('provisioning failure recovers named sandbox and never leaks SDK errors', async () => {
  const fixture = labFixture(); fixture.state.createFails = true;
  const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.measurement, 'NOT_AVAILABLE');
  assert.equal(fixture.state.gets, 1); assert.equal(fixture.state.deletes, 1);
  assert.ok(!JSON.stringify(result).includes('unit-test-secret'));
});

test('mutable snapshot names and mismatched resources fail before workload execution', async () => {
  const fixture = labFixture(); const config = configured(); config.DAYTONA_SNAPSHOT = 'lab-v1';
  const first = await new DaytonaProvider(config, () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(first.error?.code, 'IMMUTABLE_SNAPSHOT_REQUIRED'); assert.equal(fixture.state.creates, 0);
  fixture.sandbox.cpu = 2;
  const second = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(second.error?.code, 'ENVIRONMENT_MISMATCH'); assert.equal(fixture.commands.length, 0);
  assert.equal(second.cleanup.status, 'DELETED');
});

test('missing cached model fails during preparation without claiming inference', async () => {
  const fixture = labFixture(); fixture.state.preparedExit = 2;
  const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.error?.code, 'RUNTIME_NOT_READY');
  assert.equal(result.measurement, 'NOT_AVAILABLE'); assert.equal(result.metrics.exitStatus, null);
  assert.equal(fixture.commands.length, 1); assert.equal(result.cleanup.status, 'DELETED');
});

test('real runner failure retains measured failed execution, never reports success', async () => {
  const fixture = labFixture(); fixture.state.executionExit = 1; fixture.execution.error = { code: 'BENCHMARK_TIMEOUT', message: 'Timed out.' };
  const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.measurement, 'MEASURED'); assert.equal(result.success, false);
  assert.equal(result.metrics.exitStatus, 1); assert.equal(result.evaluator, null);
  assert.equal(fixture.commands.length, 2);
});

test('failed evaluation is a measured failure', async () => {
  const fixture = labFixture(); fixture.state.evaluatorExit = 1; fixture.evaluation.passed = false; fixture.evaluation.checks[0]!.passed = false;
  const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.measurement, 'MEASURED'); assert.equal(result.status, 'FAILED');
  assert.equal(result.metrics.evaluatorExitStatus, 1); assert.equal(result.error?.code, 'EVALUATION_FAILED');
});

test('missing artifacts or contradictory evaluator evidence are not MEASURED', async () => {
  for (const broken of ['download', 'contradiction'] as const) {
    const fixture = labFixture(); fixture.state.downloadFails = broken === 'download';
    if (broken === 'contradiction') fixture.evaluation.checks[0]!.passed = false;
    const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(request, { runId: 'test', transition() {} });
    assert.equal(result.measurement, 'NOT_AVAILABLE'); assert.equal(result.success, false);
    assert.equal(fixture.state.deletes, 1);
  }
});

test('cleanup failure remains visible and is retried on shutdown', async () => {
  const fixture = labFixture(); fixture.state.deleteFails = true;
  const provider = new DaytonaProvider(configured(), () => fixture.client);
  const result = await provider.runBenchmark(request, { runId: 'test', transition() {} });
  assert.equal(result.cleanup.status, 'FAILED'); assert.equal(result.cleanup.sandboxId, 'test-sandbox');
  fixture.state.deleteFails = false; await provider.cleanup(); assert.equal(fixture.state.deletes, 2);
});
