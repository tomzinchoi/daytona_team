import type { Architecture, ModelProfile, PredictedBenchmarkResult, Workload } from "../shared/types.js";
import { MODEL_PROFILES } from "./models.js";
import { workloadFingerprint } from "./results.js";
import { DEFAULT_WEIGHTS, normalizedUtility } from "./scoring.js";
import { integer, numberIn, requireInput, validateArchitecture, validateWorkload } from "./validation.js";

export function screenArchitectures(workload: Workload, candidates: Architecture[], topK = 3, profiles: ModelProfile[] = MODEL_PROFILES): PredictedBenchmarkResult[] {
  validateWorkload(workload); integer(topK, "topK", 1, 20);
  requireInput(Array.isArray(candidates) && candidates.length <= 100, "Provide at most 100 screening candidates");
  candidates.forEach(validateArchitecture);
  requireInput(new Set(candidates.map((entry) => entry.id)).size === candidates.length, "Candidate IDs must be unique");
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  requireInput(byId.size === profiles.length, "Model profile IDs must be unique");
  for (const profile of profiles) {
    requireInput(profile.prediction.kind === "PREDICTED", "Model profile characteristics must be PREDICTED");
    for (const key of ["reasoning", "coding", "instructionFollowing", "verification"] as const) numberIn(profile.prediction[key], key, 0, 1);
    numberIn(profile.prediction.speedTokensPerSecond, "speedTokensPerSecond", 0.001);
    numberIn(profile.prediction.memoryMb, "memoryMb", 1);
  }
  const fingerprint = workloadFingerprint(workload);
  const predicted = candidates.map((architecture): PredictedBenchmarkResult => {
    const models = architecture.agents.map((agent) => {
      const profile = byId.get(agent.modelId);
      requireInput(profile, `Missing profile for ${agent.modelId}`);
      return profile.prediction;
    });
    const implementerIndex = architecture.agents.findIndex((agent) => agent.role === "IMPLEMENTER");
    requireInput(implementerIndex >= 0, "Screened architectures need an implementer");
    const implementer = models[implementerIndex]!;
    let quality = 0.6 * implementer.coding + 0.25 * implementer.instructionFollowing + 0.15 * implementer.reasoning;
    architecture.agents.forEach((agent, i) => {
      if (agent.role === "PLANNER") quality += 0.12 * (models[i]!.reasoning - 0.6);
      if (agent.role === "REVIEWER") quality += 0.12 * (models[i]!.verification - 0.6);
    });
    // Added stages can lose quality through handoff mistakes, and always cost time.
    quality -= 0.022 * (architecture.agents.length - 1);
    const budget = architecture.compute.maxOutputTokensPerAgent;
    quality += Math.max(-0.12, Math.min(0.015, Math.log2(budget / 768) * 0.05));
    const expectedTokens = Math.min(budget, 220 + budget * 0.16);
    const caseMs = models.reduce((sum, model) => sum + expectedTokens / model.speedTokensPerSecond * 1000 + 200, 0);
    if (caseMs > architecture.compute.timeoutMsPerCase) quality *= architecture.compute.timeoutMsPerCase / caseMs;
    quality = Math.max(0, Math.min(1, quality));
    const latencyMs = caseMs * workload.cases.length;
    const relativeCompute = models.reduce((sum, model) => sum + expectedTokens * model.memoryMb / 6144, 0) * workload.cases.length;
    return {
      id: `prediction:${architecture.id}`, kind: "PREDICTED", workloadId: workload.id, workloadVersion: workload.version,
      workloadFingerprint: fingerprint, architecture: structuredClone(architecture),
      modelIds: [...new Set(architecture.agents.map((agent) => agent.modelId))], succeeded: null,
      provider: { id: "daytona", name: "Daytona benchmark runner", status: "NOT_CONFIGURED", executionEnvironment: "DAYTONA", detail: "Target provider only. Session 2 must configure execution and model hosting; no provider has run this prediction." },
      metrics: {
        kind: "PREDICTED", quality: { kind: "PREDICTED", score: quality, rationale: ["Illustrative coding, instruction-following, and reasoning priors, adjusted for stage handoffs and output budget.", "Extra agents receive both a potential specialization benefit and a handoff penalty; single-model configurations can win."] },
        latencyMs, resource: { kind: "PREDICTED", relativeCompute, peakMemoryMb: Math.max(...models.map((model) => model.memoryMb)) },
      },
      screeningScore: 0,
      assumptions: [
        "All values are PREDICTED screening heuristics, not benchmark evidence or dollar costs.",
        "Compute variants change token/time budgets; physical hardware is provider-managed and must be recorded by the executor.",
        "Serial model calls; predicted peak memory assumes prior models can be unloaded. Hosting may use more memory.",
        "Profiles are uncalibrated hypotheses. This ranking is specific to this tiny coding workload and candidate set.",
      ],
    };
  });
  const qualities = predicted.map((entry) => entry.metrics.quality.score);
  const latencies = predicted.map((entry) => entry.metrics.latencyMs);
  const resources = predicted.map((entry) => entry.metrics.resource.relativeCompute);
  for (const entry of predicted) entry.screeningScore =
    DEFAULT_WEIGHTS.quality * normalizedUtility(entry.metrics.quality.score, qualities, true) +
    DEFAULT_WEIGHTS.latency * normalizedUtility(entry.metrics.latencyMs, latencies, false) +
    DEFAULT_WEIGHTS.resource * normalizedUtility(entry.metrics.resource.relativeCompute, resources, false);
  return predicted.sort((a, b) => b.screeningScore - a.screeningScore || a.architecture.id.localeCompare(b.architecture.id)).slice(0, topK);
}
