import { DEMO_WORKLOAD, createMeasuredResult, generateArchitectures } from "../src/index.js";
import type { CaseEvidence, MeasuredBenchmarkResult, ResourceUsage } from "../src/shared/types.js";

/** Synthetic inputs for unit tests ONLY. They are never returned by the API. */
export function evidence(passedPerCase = [4, 4, 4]): CaseEvidence[] {
  return DEMO_WORKLOAD.cases.map((entry, index) => ({
    caseId: entry.id, status: "COMPLETED", buildSucceeded: true,
    tests: { passed: passedPerCase[index]!, failed: entry.evaluation.expectedTests - passedPerCase[index]!, skipped: 0 },
  }));
}

export function measured(index: number, passes = [4, 4, 4], latencyMs = 1000, costUsd: number | null = 1, resource?: Partial<ResourceUsage>): MeasuredBenchmarkResult {
  return createMeasuredResult({
    id: `unit-test-result-${index}`, workload: DEMO_WORKLOAD, architecture: generateArchitectures(DEMO_WORKLOAD)[index]!,
    provider: { id: "unit-test-fixture", name: "Synthetic unit-test fixture", status: "READY", executionEnvironment: "LOCAL", detail: "Only for unit tests; this is not a live benchmark." },
    evidence: evidence(passes), latencyMs,
    resource: { costUsd, computeTimeMs: null, computeTimeBasis: null, peakMemoryMb: null, measurementContext: "Synthetic unit-test input", ...resource },
    measuredAt: "2026-09-19T00:00:00.000Z",
  });
}
