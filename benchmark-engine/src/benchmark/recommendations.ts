import type { MeasuredBenchmarkResult, Recommendation, RecommendRequest, RecommendResponse, ResourceMetric, Workload } from "../shared/types.js";
import { calculateQuality } from "./quality.js";
import { validateMeasuredResult } from "./results.js";
import { DEFAULT_WEIGHTS, normalizedUtility, validateWeights } from "./scoring.js";
import { numberIn, record, requireInput, validateWorkload } from "./validation.js";

export const COMPARISON_CLAIM = "Best among evaluated configurations for this workload." as const;
const RESOURCE_METRICS: ResourceMetric[] = ["costUsd", "computeTimeMs", "peakMemoryMb"];

function validateResults(workload: Workload, results: unknown): asserts results is MeasuredBenchmarkResult[] {
  validateWorkload(workload);
  requireInput(Array.isArray(results) && results.length <= 100, "results must be an array of at most 100 measured results");
  const ids = new Set<string>(), architectures = new Set<string>();
  for (const result of results) {
    validateMeasuredResult(result, workload);
    requireInput(!ids.has(result.id), "Result IDs must be unique"); ids.add(result.id);
    requireInput(!architectures.has(result.architecture.id), "Submit one full-workload result per architecture; repeated trials require a separate aggregation policy"); architectures.add(result.architecture.id);
  }
}

function comparable(results: MeasuredBenchmarkResult[], metric: ResourceMetric): boolean {
  if (!results.length || results.some((entry) => entry.metrics.resource[metric] === null)) return false;
  return metric !== "computeTimeMs" || new Set(results.map((entry) => entry.metrics.resource.computeTimeBasis)).size === 1;
}

function frontier(results: MeasuredBenchmarkResult[], metric: ResourceMetric): MeasuredBenchmarkResult[] {
  return results.filter((candidate) => !results.some((other) => {
    const a = other.metrics, b = candidate.metrics;
    return a.quality.score >= b.quality.score && a.latencyMs <= b.latencyMs && a.resource[metric]! <= b.resource[metric]! &&
      (a.quality.score > b.quality.score || a.latencyMs < b.latencyMs || a.resource[metric]! < b.resource[metric]!);
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function calculateParetoFrontier(workload: Workload, results: MeasuredBenchmarkResult[], metric: ResourceMetric): MeasuredBenchmarkResult[] {
  validateResults(workload, results);
  requireInput(RESOURCE_METRICS.includes(metric), "Unknown resource metric");
  if (!results.length) return [];
  requireInput(comparable(results, metric), `Pareto filtering requires comparable measured ${metric} for every result`);
  return structuredClone(frontier(results, metric));
}

export function recommend(request: RecommendRequest): RecommendResponse {
  record(request, "request");
  validateResults(request.workload, request.results);
  const weights = request.weights ?? DEFAULT_WEIGHTS; validateWeights(weights);
  const acceptableQuality = request.acceptableQuality ?? request.workload.qualityPolicy.acceptableQuality;
  numberIn(acceptableQuality, "acceptableQuality", 0, 1);
  if (request.resourceMetric !== undefined) requireInput(RESOURCE_METRICS.includes(request.resourceMetric), "Unknown resourceMetric");
  // Recompute explanations from evidence, so caller-written rationale is never authoritative.
  const results = request.results.map((entry) => ({ ...structuredClone(entry), metrics: { ...structuredClone(entry.metrics), quality: calculateQuality(request.workload, entry.metrics.quality.evidence) } }));
  const response: RecommendResponse = {
    kind: "MEASURED", paretoFrontier: [], performance: null, balanced: null, efficient: null,
    resourceMetric: null, weights: { ...weights }, acceptableQuality, evaluatedCount: results.length, warnings: [], claim: COMPARISON_CLAIM,
  };
  if (!results.length) { response.warnings.push("No measured results are available. Run the screened architectures first."); return response; }
  const metric = request.resourceMetric
    ? (comparable(results, request.resourceMetric) ? request.resourceMetric : null)
    : RESOURCE_METRICS.find((candidate) => comparable(results, candidate)) ?? null;
  response.resourceMetric = metric;
  const tieBreak = (a: MeasuredBenchmarkResult, b: MeasuredBenchmarkResult): number =>
    b.metrics.quality.score - a.metrics.quality.score || a.metrics.latencyMs - b.metrics.latencyMs ||
    (metric ? a.metrics.resource[metric]! - b.metrics.resource[metric]! : 0) || a.id.localeCompare(b.id);
  const make = (category: Recommendation["category"], result: MeasuredBenchmarkResult, rationale: string, score: number | null = null): Recommendation => ({
    category, kind: "MEASURED", resultId: result.id, architectureId: result.architecture.id,
    quality: result.metrics.quality.score, latencyMs: result.metrics.latencyMs,
    resource: metric ? { metric, value: result.metrics.resource[metric]! } : null,
    score, rationale, claim: COMPARISON_CLAIM,
  });
  const performance = [...results].sort(tieBreak)[0]!;
  response.performance = make("PERFORMANCE", performance, "Highest measured objective quality; ties prefer lower latency, then lower comparable resource usage.", performance.metrics.quality.score);
  if (results.some((entry) => !entry.succeeded)) response.warnings.push("Some evaluated runs did not complete every task successfully; inspect succeeded and the quality evidence.");
  if (metric === null) {
    response.warnings.push("No common measured resource metric is available for every result (compute time also requires an identical accounting basis). Performance is available; Pareto, balanced, and efficient recommendations require comparable resource measurements. Missing values are never treated as zero.");
    return response;
  }
  response.paretoFrontier = frontier(results, metric);
  const qualities = results.map((entry) => entry.metrics.quality.score);
  const latencies = results.map((entry) => entry.metrics.latencyMs);
  const resources = results.map((entry) => entry.metrics.resource[metric]!);
  const score = (entry: MeasuredBenchmarkResult) =>
    weights.quality * normalizedUtility(entry.metrics.quality.score, qualities, true) +
    weights.latency * normalizedUtility(entry.metrics.latencyMs, latencies, false) +
    weights.resource * normalizedUtility(entry.metrics.resource[metric]!, resources, false);
  const balanced = [...response.paretoFrontier].sort((a, b) => score(b) - score(a) || tieBreak(a, b))[0]!;
  response.balanced = make("BALANCED", balanced, `Highest weighted normalized measured score: quality ${weights.quality}, latency ${weights.latency}, ${metric} ${weights.resource}. Normalization uses this evaluated set only.`, score(balanced));
  const efficient = response.paretoFrontier.filter((entry) => entry.metrics.quality.score >= acceptableQuality)
    .sort((a, b) => a.metrics.resource[metric]! - b.metrics.resource[metric]! || tieBreak(a, b))[0];
  if (efficient) response.efficient = make("EFFICIENT", efficient, `Lowest measured ${metric} while meeting the acceptable-quality threshold ${acceptableQuality}.`);
  else response.warnings.push(`No evaluated configuration meets acceptable quality ${acceptableQuality}; efficient is unavailable.`);
  const picks = [response.performance, response.balanced, response.efficient].filter((entry): entry is Recommendation => entry !== null);
  if (new Set(picks.map((entry) => entry.resultId)).size < picks.length) response.warnings.push("One evaluated configuration wins more than one category. Categories are logical recommendations and need not be distinct architectures.");
  return response;
}
