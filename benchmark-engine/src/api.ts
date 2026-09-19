import type { ArchitecturesRequest, ArchitecturesResponse, ComputeConfig, RecommendRequest, RecommendResponse } from "./shared/types.js";
import { generateArchitectures } from "./benchmark/architectures.js";
import { recommend } from "./benchmark/recommendations.js";
import { screenArchitectures } from "./benchmark/screening.js";
import { record, validateWorkload } from "./benchmark/validation.js";
import { aggregateRuntimeResults } from "./benchmark/aggregation.js";

export function aggregateResultsEndpoint(input: unknown) {
  return { result: aggregateRuntimeResults(input) };
}

/** Framework-independent endpoint handlers; safe to call from another backend. */
export function architecturesEndpoint(input: unknown): ArchitecturesResponse {
  record(input, "request"); validateWorkload(input.workload);
  const candidateArchitectures = generateArchitectures(input.workload, input.computeConfigs as ComputeConfig[] | undefined);
  return { candidateArchitectures, screenedArchitectures: screenArchitectures(input.workload, candidateArchitectures, 3), screeningKind: "PREDICTED" };
}

export function recommendEndpoint(input: unknown): RecommendResponse {
  record(input, "request");
  return recommend(input as unknown as RecommendRequest);
}

// Named contracts are re-exported for framework adapters and Session 3 clients.
export type { ArchitecturesRequest, ArchitecturesResponse, RecommendRequest, RecommendResponse };
