import { createHash } from "node:crypto";
import type { Architecture, CaseEvidence, MeasuredBenchmarkResult, ProviderStatus, ResourceUsage, Workload } from "../shared/types.js";
import { calculateQuality } from "./quality.js";
import { nonempty, numberIn, record, requireInput, validateArchitecture, validateProvider, validateResources, validateWorkload } from "./validation.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function workloadFingerprint(workload: Workload): string {
  validateWorkload(workload);
  return createHash("sha256").update(canonical(workload)).digest("hex");
}

export interface MeasuredResultInput {
  id: string;
  workload: Workload;
  architecture: Architecture;
  provider: ProviderStatus;
  evidence: CaseEvidence[];
  latencyMs: number;
  resource: ResourceUsage;
  measuredAt: string;
}

/** Call only after actual execution. This helper does not run or simulate models. */
export function createMeasuredResult(input: MeasuredResultInput): MeasuredBenchmarkResult {
  const quality = calculateQuality(input.workload, input.evidence);
  const result: MeasuredBenchmarkResult = {
    id: input.id, kind: "MEASURED", workloadId: input.workload.id, workloadVersion: input.workload.version,
    workloadFingerprint: workloadFingerprint(input.workload), architecture: structuredClone(input.architecture),
    modelIds: [...new Set(input.architecture.agents.map((agent) => agent.modelId))],
    provider: { ...input.provider }, succeeded: quality.taskSuccessRate === 1, measuredAt: input.measuredAt,
    metrics: { kind: "MEASURED", quality, latencyMs: input.latencyMs, resource: { ...input.resource } },
  };
  validateMeasuredResult(result, input.workload);
  return result;
}

export function validateMeasuredResult(value: unknown, workload: Workload): asserts value is MeasuredBenchmarkResult {
  record(value, "result");
  requireInput(value.kind === "MEASURED", "Recommendations accept MEASURED results only; PREDICTED results cannot be submitted");
  nonempty(value.id, "result.id");
  requireInput(value.workloadId === workload.id && value.workloadVersion === workload.version && value.workloadFingerprint === workloadFingerprint(workload), "Results must match the exact workload and version (including tests and quality policy)");
  validateArchitecture(value.architecture); validateProvider(value.provider);
  requireInput(value.provider.status === "READY", "A measured result must identify a provider that was READY when execution started");
  nonempty(value.measuredAt, "measuredAt"); requireInput(Number.isFinite(Date.parse(value.measuredAt)), "measuredAt must be a valid timestamp");
  const modelIds = [...new Set(value.architecture.agents.map((agent) => agent.modelId))];
  const submittedModels = value.modelIds;
  requireInput(Array.isArray(submittedModels) && submittedModels.length === modelIds.length && modelIds.every((id, i) => submittedModels[i] === id), "modelIds must exactly match the architecture, in first-use order");
  record(value.metrics, "metrics"); requireInput(value.metrics.kind === "MEASURED", "Measured results require MEASURED metrics");
  numberIn(value.metrics.latencyMs, "latencyMs", Number.MIN_VALUE); validateResources(value.metrics.resource);
  record(value.metrics.quality, "quality");
  requireInput(value.metrics.quality.kind === "MEASURED", "Measured results require MEASURED quality evidence");
  const quality = calculateQuality(workload, value.metrics.quality.evidence as CaseEvidence[]);
  for (const key of ["score", "testPassRate", "buildSuccessRate", "taskSuccessRate"] as const) {
    numberIn(value.metrics.quality[key], `quality.${key}`, 0, 1);
    requireInput(Math.abs(value.metrics.quality[key] - quality[key]) < 1e-9, `quality.${key} does not match execution evidence`);
  }
  requireInput(Array.isArray(value.metrics.quality.rationale) && value.metrics.quality.rationale.every((item) => typeof item === "string"), "Quality rationale must be an array of strings");
  requireInput(value.succeeded === (quality.taskSuccessRate === 1), "succeeded must match objective case evidence");
}
