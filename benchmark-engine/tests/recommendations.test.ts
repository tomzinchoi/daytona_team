import test from "node:test";
import assert from "node:assert/strict";
import { architecturesEndpoint, calculateParetoFrontier, DEMO_WORKLOAD, recommend, recommendEndpoint } from "../src/index.js";
import { measured } from "./helpers.js";

test("Pareto dominance maximizes quality and minimizes both latency and cost", () => {
  const best = measured(0, [4, 4, 4], 100, 1);
  const dominated = measured(1, [4, 3, 3], 200, 2);
  const fast = measured(2, [4, 3, 3], 50, 3);
  const cheap = measured(3, [4, 3, 3], 300, 0.1);
  const frontier = calculateParetoFrontier(DEMO_WORKLOAD, [dominated, best, fast, cheap], "costUsd");
  assert.deepEqual(new Set(frontier.map((entry) => entry.id)), new Set([best.id, fast.id, cheap.id]));
});

test("identical metric points do not dominate each other", () => {
  assert.equal(calculateParetoFrontier(DEMO_WORKLOAD, [measured(0), measured(1)], "costUsd").length, 2);
});

test("three logical recommendations select distinct tradeoffs where present", () => {
  const performance = measured(0, [4, 4, 4], 1000, 10);
  const balanced = measured(1, [4, 4, 3], 200, 2);
  const efficient = measured(2, [4, 4, 2], 600, 0.5);
  const result = recommend({ workload: DEMO_WORKLOAD, results: [efficient, performance, balanced] });
  assert.equal(result.performance?.resultId, performance.id);
  assert.equal(result.balanced?.resultId, balanced.id);
  assert.equal(result.efficient?.resultId, efficient.id);
  assert.deepEqual(result.weights, { quality: 0.5, latency: 0.3, resource: 0.2 });
  assert.equal(result.paretoFrontier.length, 3); assert.equal(result.resourceMetric, "costUsd");
  for (const pick of [result.performance!, result.balanced!, result.efficient!]) {
    assert.equal(pick.kind, "MEASURED"); assert.match(pick.claim, /among evaluated configurations for this workload/);
  }
});

test("one measured result can honestly win all three categories", () => {
  const result = recommend({ workload: DEMO_WORKLOAD, results: [measured(0)] });
  assert.equal(result.performance?.resultId, result.balanced?.resultId);
  assert.equal(result.balanced?.resultId, result.efficient?.resultId);
  assert.equal(result.balanced?.score, 1);
  assert.match(result.warnings.join(" "), /more than one category/);
});

test("empty measured results return explicit unavailability without predictions", () => {
  const result = recommend({ workload: DEMO_WORKLOAD, results: [] });
  assert.equal(result.performance, null); assert.equal(result.balanced, null); assert.equal(result.efficient, null);
  assert.deepEqual(result.paretoFrontier, []); assert.equal(result.evaluatedCount, 0);
});

test("efficiency never relaxes the acceptable-quality threshold silently", () => {
  const result = recommend({ workload: DEMO_WORKLOAD, results: [measured(0, [1, 1, 1])], acceptableQuality: 0.8 });
  assert.equal(result.efficient, null); assert.ok(result.performance); assert.ok(result.balanced);
  assert.match(result.warnings.join(" "), /No evaluated configuration meets acceptable quality/);
});

test("recommendation API rejects predicted, mixed, and relabeled predicted records", () => {
  const predicted = architecturesEndpoint({ workload: DEMO_WORKLOAD }).screenedArchitectures[0]!;
  assert.throws(() => recommendEndpoint({ workload: DEMO_WORKLOAD, results: [predicted] }), /MEASURED results only/);
  assert.throws(() => recommendEndpoint({ workload: DEMO_WORKLOAD, results: [measured(0), predicted] }), /MEASURED results only/);
  assert.throws(() => recommendEndpoint({ workload: DEMO_WORKLOAD, results: [{ ...predicted, kind: "MEASURED", provider: measured(0).provider, measuredAt: measured(0).measuredAt }] }), /MEASURED metrics/);
});

test("rejects claimed quality and success that disagree with objective evidence", () => {
  const forged = measured(0, [3, 3, 3]); forged.metrics.quality.score = 1;
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [forged] }), /does not match execution evidence/);
  const success = measured(0, [3, 3, 3]); success.succeeded = true;
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [success] }), /succeeded must match/);
  const rationale = measured(0); rationale.metrics.quality.rationale = ["universal optimum"];
  const result = recommend({ workload: DEMO_WORKLOAD, results: [rationale] });
  assert.doesNotMatch(result.paretoFrontier[0]!.metrics.quality.rationale.join(" "), /universal optimum/);
});

test("rejects mismatched workload, evaluator fingerprint, and duplicate trials", () => {
  const wrongWorkload = measured(0); wrongWorkload.workloadId = "other";
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [wrongWorkload] }), /exact workload/);
  const wrongHash = measured(0); wrongHash.workloadFingerprint = "invalid";
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [wrongHash] }), /exact workload/);
  const duplicate = measured(0); duplicate.id = "different-trial";
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [measured(0), duplicate] }), /one full-workload result per architecture/);
});

test("missing resource telemetry is never treated as zero or estimated", () => {
  const result = recommend({ workload: DEMO_WORKLOAD, results: [measured(0), measured(1, [4, 4, 4], 100, null)] });
  assert.ok(result.performance); assert.equal(result.performance.resource, null);
  assert.equal(result.balanced, null); assert.equal(result.efficient, null); assert.deepEqual(result.paretoFrontier, []);
  assert.match(result.warnings.join(" "), /Missing values are never treated as zero/);
});

test("zero measured cost is valid and efficient", () => {
  const free = measured(0, [4, 4, 4], 1000, 0);
  const result = recommend({ workload: DEMO_WORKLOAD, results: [free, measured(1, [4, 4, 4], 500, 1)] });
  assert.equal(result.efficient?.resultId, free.id); assert.equal(result.efficient?.resource?.value, 0);
});

test("compute-time comparison requires a common accounting basis", () => {
  const a = measured(0, [4, 4, 4], 100, null, { computeTimeMs: 200, computeTimeBasis: "A10 GPU-milliseconds" });
  const b = measured(1, [4, 4, 4], 200, null, { computeTimeMs: 100, computeTimeBasis: "CPU core-milliseconds" });
  assert.equal(recommend({ workload: DEMO_WORKLOAD, results: [a, b] }).resourceMetric, null);
  assert.throws(() => calculateParetoFrontier(DEMO_WORKLOAD, [a, b], "computeTimeMs"), /comparable/);
  b.metrics.resource.computeTimeBasis = "A10 GPU-milliseconds";
  const result = recommend({ workload: DEMO_WORKLOAD, results: [a, b] });
  assert.equal(result.resourceMetric, "computeTimeMs"); assert.equal(result.efficient?.resultId, b.id);
});

test("common measured memory is a valid fallback; explicit metric choices are respected", () => {
  const a = measured(0, [4, 4, 4], 100, null, { peakMemoryMb: 6000 });
  const b = measured(1, [4, 4, 4], 200, null, { peakMemoryMb: 4000 });
  const result = recommend({ workload: DEMO_WORKLOAD, results: [a, b] });
  assert.equal(result.resourceMetric, "peakMemoryMb"); assert.equal(result.efficient?.resultId, b.id);
  assert.equal(recommend({ workload: DEMO_WORKLOAD, results: [a, b], resourceMetric: "costUsd" }).resourceMetric, null);
});

test("normalization and tie-breaking are deterministic under shuffled input", () => {
  const inputs = [measured(1), measured(0)];
  const a = recommend({ workload: DEMO_WORKLOAD, results: inputs });
  const b = recommend({ workload: DEMO_WORKLOAD, results: [...inputs].reverse() });
  assert.deepEqual(a, b); assert.equal(a.performance?.resultId, "unit-test-result-0");
});

test("invalid weights, nonfinite metrics, wrong model IDs, and disconnected providers are rejected", () => {
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [measured(0)], weights: { quality: 1, latency: 1, resource: 0 } }), /sum to 1/);
  const invalid = measured(0); invalid.metrics.latencyMs = NaN;
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [invalid] }), /finite number/);
  const models = measured(0); models.modelIds = ["gemma-3-4b"];
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [models] }), /modelIds/);
  const disconnected = measured(0); disconnected.provider.status = "NOT_CONFIGURED";
  assert.throws(() => recommend({ workload: DEMO_WORKLOAD, results: [disconnected] }), /READY/);
});

test("public Pareto filtering also rejects predicted records", () => {
  const predicted = architecturesEndpoint({ workload: DEMO_WORKLOAD }).screenedArchitectures;
  assert.throws(() => calculateParetoFrontier(DEMO_WORKLOAD, predicted as never, "costUsd"), /MEASURED results only/);
});

test("successful recommendation does not mutate submitted measurements", () => {
  const entries = [measured(0), measured(1)]; const original = structuredClone(entries);
  recommend({ workload: DEMO_WORKLOAD, results: entries }); assert.deepEqual(entries, original);
});
