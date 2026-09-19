import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuality, DEMO_WORKLOAD, workloadFingerprint } from "../src/index.js";
import { evidence } from "./helpers.js";

test("quality is 80% tests, 10% build, 10% complete task success", () => {
  const all = calculateQuality(DEMO_WORKLOAD, evidence());
  assert.equal(all.score, 1); assert.equal(all.taskSuccessRate, 1); assert.equal(all.kind, "MEASURED");
  const partial = calculateQuality(DEMO_WORKLOAD, evidence([4, 2, 0]));
  assert.equal(partial.testPassRate, 0.5); assert.equal(partial.buildSuccessRate, 1); assert.equal(partial.taskSuccessRate, 1 / 3);
  assert.ok(Math.abs(partial.score - (0.8 * 0.5 + 0.1 + 0.1 / 3)) < 1e-12);
  assert.match(partial.rationale.join(" "), /6\/12 trusted tests/);
});

test("timeouts and unexecuted tests earn no task or test credit", () => {
  const cases = evidence().map((entry) => ({ ...entry, status: "TIMEOUT" as const, buildSucceeded: false, tests: { passed: 0, failed: 0, skipped: 4 } }));
  const quality = calculateQuality(DEMO_WORKLOAD, cases);
  assert.equal(quality.score, 0); assert.equal(quality.taskSuccessRate, 0);
});

test("a passing test count does not conceal failed build or runtime errors", () => {
  const cases = evidence(); cases[0]!.buildSucceeded = false; cases[1]!.status = "ERROR";
  const quality = calculateQuality(DEMO_WORKLOAD, cases);
  assert.equal(quality.taskSuccessRate, 1 / 3); assert.equal(quality.buildSuccessRate, 2 / 3);
});

test("quality rejects missing cases, duplicate cases, and impossible test counts", () => {
  assert.throws(() => calculateQuality(DEMO_WORKLOAD, evidence().slice(1)), /every workload case/);
  const duplicate = evidence(); duplicate[1]!.caseId = duplicate[0]!.caseId;
  assert.throws(() => calculateQuality(DEMO_WORKLOAD, duplicate), /without duplicates/);
  const overCount = evidence(); overCount[0]!.tests.passed = 5;
  assert.throws(() => calculateQuality(DEMO_WORKLOAD, overCount), /expectedTests/);
  const negative = evidence(); negative[0]!.tests.failed = -1;
  assert.throws(() => calculateQuality(DEMO_WORKLOAD, negative), /finite number/);
});

test("workload fingerprint is key-order independent and changes with evaluator content", () => {
  const changed = structuredClone(DEMO_WORKLOAD);
  changed.cases[0]!.evaluation.files["solution.test.cjs"] += "\n// changed evaluator";
  assert.notEqual(workloadFingerprint(changed), workloadFingerprint(DEMO_WORKLOAD));
  const reversed = Object.fromEntries(Object.entries(DEMO_WORKLOAD).reverse()) as unknown as typeof DEMO_WORKLOAD;
  assert.equal(workloadFingerprint(reversed), workloadFingerprint(DEMO_WORKLOAD));
});

test("workload contracts reject empty cases, unsafe paths, overlapping tests, and invalid weights", () => {
  const bad = structuredClone(DEMO_WORKLOAD); bad.cases = [];
  assert.throws(() => workloadFingerprint(bad), /1–100/);
  const unsafe = structuredClone(DEMO_WORKLOAD); unsafe.cases[0]!.files["../escape.cjs"] = "";
  assert.throws(() => workloadFingerprint(unsafe), /safe relative paths/);
  const overlap = structuredClone(DEMO_WORKLOAD); overlap.cases[0]!.evaluation.files["solution.cjs"] = "";
  assert.throws(() => workloadFingerprint(overlap), /must not overlap/);
  const weights = structuredClone(DEMO_WORKLOAD); weights.qualityPolicy.testWeight = 1;
  assert.throws(() => workloadFingerprint(weights), /sum to 1/);
});
