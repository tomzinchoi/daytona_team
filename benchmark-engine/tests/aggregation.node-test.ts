import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { aggregateRuntimeResults, contractFingerprint, createBenchmarkServer, DEMO_WORKLOAD, generateArchitectures, recommend, runtimeFixture } from "../src/index.js";

/** Synthetic transport records for ingestion tests; no live execution is claimed. */
function request(index = 0) {
  const architecture = generateArchitectures(DEMO_WORKLOAD)[index]!;
  return {
    id: `test-aggregate-${index}`, workload: DEMO_WORKLOAD, architecture,
    provider: { id: "daytona", name: "Test provider fixture", status: "READY" as const, executionEnvironment: "DAYTONA" as const, detail: "Synthetic test transport only" },
    measuredAt: "2026-09-19T00:00:00.000Z",
    runs: DEMO_WORKLOAD.cases.map((entry, i) => ({
      runId: `test-case-${index}-${i}`, measurement: "MEASURED", provider: "daytona", architectureId: architecture.id, benchmarkCaseId: entry.id,
      success: true, status: "COMPLETED",
      metrics: { totalElapsedMs: 1000 + i, elapsedMs: 500 },
      caseEvidence: { caseId: entry.id, status: "COMPLETED", buildSucceeded: true, tests: { passed: 4, failed: 0, skipped: 0 } },
      agents: architecture.agents.map(agent => ({ model: agent.modelId, role: `${agent.role}: ${agent.instruction}` })),
      provenance: { sourceArchitectureHash: contractFingerprint(architecture), fixtureHash: contractFingerprint(runtimeFixture(entry)),
        environmentHash: "a".repeat(64), runnerHash: "b".repeat(64), snapshotId: "test-snapshot", inference: "local-llama.cpp",
        modelManifest: { version: "test-only" }, resources: { cpu: architecture.compute.requestedCpuCores, memory: architecture.compute.requestedMemoryMb / 1024, disk: 20 },
        maxTokensPerAgent: architecture.compute.maxOutputTokensPerAgent, timeoutSeconds: architecture.compute.timeoutMsPerCase / 1000 },
    })),
  };
}

test("runtime aggregation verifies a complete workload, sums wall time, and leaves unknown telemetry null", () => {
  const input = request(); const original = structuredClone(input);
  const result = aggregateRuntimeResults(input);
  assert.equal(result.kind, "MEASURED"); assert.equal(result.succeeded, true);
  assert.equal(result.metrics.latencyMs, 3003); assert.equal(result.metrics.quality.score, 1);
  assert.equal(result.metrics.resource.peakMemoryMb, null); assert.equal(result.metrics.resource.costUsd, null);
  assert.equal(result.metrics.resource.computeTimeMs, null);
  assert.deepEqual(input, original);
  const recommendation = recommend({ workload: input.workload, results: [result] });
  assert.ok(recommendation.performance); assert.equal(recommendation.balanced, null);
});

test("aggregation canonicalizes shuffled case input without changing the result", () => {
  const input = request(); const first = aggregateRuntimeResults(input);
  input.runs.reverse(); assert.deepEqual(aggregateRuntimeResults(input), first);
});

test("real test failures remain measured unsuccessful results", () => {
  const input = request(); input.runs[0]!.success = false; input.runs[0]!.status = "FAILED";
  input.runs[0]!.caseEvidence.tests = { passed: 2, failed: 2, skipped: 0 };
  const result = aggregateRuntimeResults(input);
  assert.equal(result.succeeded, false); assert.ok(result.metrics.quality.score < 1);
});

test('measured inference failures retain partial agent evidence without inventing later execution', () => {
  const input = request(6); // two-agent architecture
  const run = input.runs[0]!;
  run.success = false; run.status = 'FAILED'; run.agents = [];
  run.caseEvidence = { ...run.caseEvidence, status: 'ERROR', buildSucceeded: false, tests: { passed: 0, failed: 0, skipped: 4 } };
  Object.assign(run, { error: { code: 'OUTPUT_TOKEN_LIMIT', message: 'Actual runner exhausted token budget.' } });
  const result = aggregateRuntimeResults(input);
  assert.equal(result.succeeded, false);
  assert.equal(result.metrics.quality.evidence.length, 3);
  assert.ok(result.metrics.quality.score < 1);
  assert.equal(run.agents.length, 0);
  assert.throws(() => aggregateRuntimeResults({ ...input, runs: input.runs.map(r => ({ ...r, error: null })) }), /runtime execution error/);
});

test("full-workload measured telemetry enables all three recommendation categories", () => {
  const result = aggregateRuntimeResults({ ...request(), resource: { costUsd: 0, computeTimeMs: null, computeTimeBasis: null, peakMemoryMb: null, measurementContext: "Test fixture actual-telemetry field" } });
  const picks = recommend({ workload: DEMO_WORKLOAD, results: [result] });
  assert.ok(picks.performance); assert.ok(picks.balanced); assert.ok(picks.efficient);
  assert.equal(picks.efficient.resource?.value, 0);
});

const mutations: [string, (input: ReturnType<typeof request>) => void, RegExp][] = [
  ['missing agents from completed execution', input => { input.runs[0]!.agents = []; }, /every requested agent/],
  ["unavailable execution", input => { input.runs[0]!.measurement = "NOT_AVAILABLE"; }, /Only MEASURED/],
  ["missing case", input => { input.runs.pop(); }, /exactly one/],
  ["duplicate run ID", input => { input.runs[1]!.runId = input.runs[0]!.runId; }, /run IDs must be unique/],
  ["duplicate case", input => { input.runs[1]!.benchmarkCaseId = input.runs[0]!.benchmarkCaseId; }, /without duplicates/],
  ["wrong architecture", input => { input.runs[0]!.provenance.sourceArchitectureHash = "0".repeat(64); }, /architecture fingerprint/],
  ["different tests", input => { input.runs[0]!.provenance.fixtureHash = "0".repeat(64); }, /fixture fingerprint/],
  ["different environment", input => { input.runs[1]!.provenance.environmentHash = "c".repeat(64); }, /different execution environments/],
  ["different model manifest", input => { input.runs[1]!.provenance.modelManifest.version = "different"; }, /different execution environments/],
  ["wrong CPU allocation", input => { input.runs[0]!.provenance.resources.cpu = 64; }, /compute allocation/],
  ["wrong token limit", input => { input.runs[0]!.provenance.maxTokensPerAgent += 1; }, /inference limits/],
  ["switched model", input => { input.runs[0]!.agents[0]!.model = "gemma-3-4b"; }, /agent model/],
  ["different provider", input => { input.runs[0]!.provider = "nosana"; }, /provider and architecture/],
  ["contradictory success", input => { input.runs[0]!.success = false; }, /contradict/],
  ["impossible duration", input => { input.runs[0]!.metrics.totalElapsedMs = 100; }, /latency cannot/],
];
for (const [label, mutate, error] of mutations) test(`aggregation rejects ${label}`, () => {
  const input = request(); mutate(input); assert.throws(() => aggregateRuntimeResults(input), error);
});

test("HTTP runtime ingestion produces a result accepted by measured recommendation API", async () => {
  const server = createBenchmarkServer(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const response = await post("/api/results/aggregate", request()); assert.equal(response.status, 200);
    const body = await response.json() as { result: unknown };
    const recommendation = await post("/api/recommend", { workload: DEMO_WORKLOAD, results: [body.result] });
    assert.equal(recommendation.status, 200);
    const invalid = request(); invalid.runs[0]!.measurement = "PREDICTED";
    assert.equal((await post("/api/results/aggregate", invalid)).status, 400);
    assert.equal((await post("/api/results/aggregate", {})).status, 400);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
