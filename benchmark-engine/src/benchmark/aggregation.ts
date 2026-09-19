import type { Architecture, BenchmarkCase, CaseEvidence, MeasuredBenchmarkResult, ProviderStatus, ResourceUsage, Workload } from "../shared/types.js";
import { contractFingerprint, createMeasuredResult } from "./results.js";
import { nonempty, numberIn, record, requireInput, validateArchitecture, validateEvidence, validateProvider, validateResources, validateWorkload } from "./validation.js";

export interface AggregateRuntimeRequest {
  id: string;
  workload: Workload;
  architecture: Architecture;
  provider: ProviderStatus;
  measuredAt: string;
  /** Terminal per-case result objects, not polling envelopes. Validated at runtime. */
  runs: unknown[];
  /** Optional actual telemetry for this entire run set, never predicted values. */
  resource?: ResourceUsage;
}

/** The exact request fixture produced by Session 2's engine adapter. */
export function runtimeFixture(benchmarkCase: BenchmarkCase) {
  const build = benchmarkCase.evaluation.buildCommand;
  const test = benchmarkCase.evaluation.testCommand;
  requireInput(benchmarkCase.editableFiles.length === 1 && build.executable === "node" && test.executable === "node" &&
    build.args.length === 2 && build.args[0] === "--check" && build.args[1] === benchmarkCase.editableFiles[0] &&
    test.args.length === 3 && test.args[0] === "--test" && test.args[1] === "--test-reporter=tap" &&
    Object.hasOwn(benchmarkCase.evaluation.files, test.args[2]!), "Runtime aggregation supports the single-file Node coding evaluator only");
  return {
    id: benchmarkCase.id, task: benchmarkCase.instruction,
    evaluator: { type: "node_tests", files: benchmarkCase.files, editableFile: benchmarkCase.editableFiles[0],
      testFiles: benchmarkCase.evaluation.files, testFile: test.args[2], expectedTests: benchmarkCase.evaluation.expectedTests },
  };
}

/** Pure ingestion: no provider calls, model execution, or estimated telemetry. */
export function aggregateRuntimeResults(input: unknown): MeasuredBenchmarkResult {
  record(input, "request"); validateWorkload(input.workload); validateArchitecture(input.architecture); validateProvider(input.provider);
  nonempty(input.id, "id"); nonempty(input.measuredAt, "measuredAt");
  const { workload, architecture, provider } = input;
  requireInput(Array.isArray(input.runs) && input.runs.length === workload.cases.length, "Provide exactly one terminal runtime result for every workload case");
  const evidence: CaseEvidence[] = [];
  const runIds = new Set<string>(), caseIds = new Set<string>(), environments = new Set<string>();
  let latencyMs = 0;
  for (const run of input.runs) {
    record(run, "runtime result");
    requireInput(run.measurement === "MEASURED", "Only MEASURED runtime results can be aggregated; NOT_AVAILABLE is not evidence");
    nonempty(run.runId, "runId"); requireInput(!runIds.has(run.runId), "Runtime run IDs must be unique"); runIds.add(run.runId);
    requireInput(run.provider === provider.id && run.architectureId === architecture.id, "Runtime provider and architecture must match the aggregation request");
    nonempty(run.benchmarkCaseId, "benchmarkCaseId");
    const benchmarkCase = workload.cases.find((entry) => entry.id === run.benchmarkCaseId);
    requireInput(benchmarkCase && !caseIds.has(benchmarkCase.id), "Runtime cases must match the workload exactly, without duplicates"); caseIds.add(benchmarkCase.id);
    record(run.provenance, "provenance"); const provenance = run.provenance;
    requireInput(provenance.sourceArchitectureHash === contractFingerprint(architecture), "Runtime source architecture fingerprint does not match");
    requireInput(provenance.fixtureHash === contractFingerprint(runtimeFixture(benchmarkCase)), "Runtime fixture fingerprint does not match the trusted workload case");
    for (const key of ["environmentHash", "runnerHash"]) {
      nonempty(provenance[key], key); requireInput(/^[a-f0-9]{64}$/.test(provenance[key]), `${key} must be a SHA-256 hash`);
    }
    nonempty(provenance.snapshotId, "snapshotId"); nonempty(provenance.inference, "inference");
    record(provenance.modelManifest, "modelManifest"); record(provenance.resources, "provenance.resources");
    requireInput(provenance.resources.cpu === architecture.compute.requestedCpuCores &&
      provenance.resources.memory === architecture.compute.requestedMemoryMb / 1024 &&
      provenance.maxTokensPerAgent === architecture.compute.maxOutputTokensPerAgent &&
      provenance.timeoutSeconds === architecture.compute.timeoutMsPerCase / 1000, "Runtime compute allocation or inference limits differ from the selected architecture");
    environments.add(contractFingerprint({ environmentHash: provenance.environmentHash, runnerHash: provenance.runnerHash,
      snapshotId: provenance.snapshotId, inference: provenance.inference, modelManifest: provenance.modelManifest, resources: provenance.resources }));
    requireInput(environments.size === 1, "Do not aggregate cases from different execution environments, runners, or model manifests");
    record(run.metrics, "runtime metrics"); numberIn(run.metrics.totalElapsedMs, "totalElapsedMs", Number.MIN_VALUE);
    numberIn(run.metrics.elapsedMs, "elapsedMs");
    requireInput(run.metrics.totalElapsedMs >= run.metrics.elapsedMs, "Total runtime latency cannot be less than inference latency");
    latencyMs += run.metrics.totalElapsedMs;
    record(run.caseEvidence, "caseEvidence"); requireInput(run.caseEvidence.caseId === benchmarkCase.id, "Evidence must belong to its runtime case");
    // Preserve only the shared evidence fields, discarding display-only runtime metadata.
    const item = { caseId: run.caseEvidence.caseId, status: run.caseEvidence.status, buildSucceeded: run.caseEvidence.buildSucceeded, tests: run.caseEvidence.tests };
    validateEvidence({ ...workload, cases: [benchmarkCase] }, [item]);
    const caseEvidence = item as CaseEvidence;
    const succeeded = caseEvidence.status === "COMPLETED" && caseEvidence.buildSucceeded && caseEvidence.tests.passed === benchmarkCase.evaluation.expectedTests;
    requireInput(run.success === succeeded && run.status === (succeeded ? "COMPLETED" : "FAILED"), "Runtime success/status contradict objective case evidence");
    requireInput(Array.isArray(run.agents) && run.agents.length === architecture.agents.length, "Runtime must report every requested agent in order");
    run.agents.forEach((agent: unknown, index: number) => {
      record(agent, "runtime agent"); const expected = architecture.agents[index]!;
      requireInput(agent.model === expected.modelId && agent.role === `${expected.role}: ${expected.instruction}`, "Runtime agent model/order/instruction differs from the selected architecture");
    });
    evidence.push(caseEvidence);
  }
  let resource: ResourceUsage;
  if (input.resource !== undefined) { validateResources(input.resource); resource = input.resource; }
  else resource = { costUsd: null, computeTimeMs: null, computeTimeBasis: null, peakMemoryMb: null,
    measurementContext: `Runtime environment ${[...environments][0]}; CPU request ${architecture.compute.requestedCpuCores}, RAM request ${architecture.compute.requestedMemoryMb} MiB. Resource telemetry unavailable; allocation is not utilization.` };
  return createMeasuredResult({ id: input.id, workload, architecture, provider, measuredAt: input.measuredAt,
    evidence: workload.cases.map((entry) => evidence.find((item) => item.caseId === entry.id)!), latencyMs, resource });
}
