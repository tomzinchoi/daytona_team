import { z } from "zod";
import type {
  ArchitecturesResponse,
  Workload,
} from "../../benchmark-engine/src/shared/types";
import { snapshotSchema, type Snapshot } from "../domain";

const architecture = z.object({
  id: z.string(),
  name: z.string(),
  agents: z.array(z.object({ modelId: z.string(), role: z.string() })).min(1),
  compute: z.object({
    maxOutputTokensPerAgent: z.number(),
    timeoutMsPerCase: z.number(),
    requestedCpuCores: z.number().positive().optional(),
    requestedMemoryMb: z.number().positive().optional(),
  }),
});
const screeningSchema = z.object({
  candidateArchitectures: z.array(architecture).min(1),
  screenedArchitectures: z
    .array(
      z.object({
        kind: z.literal("PREDICTED"),
        architecture,
        metrics: z.object({
          kind: z.literal("PREDICTED"),
          quality: z.object({
            score: z.number().min(0).max(1),
            rationale: z.array(z.string()),
          }),
          latencyMs: z.number().nonnegative(),
          resource: z.object({ relativeCompute: z.number().nonnegative() }),
        }),
        assumptions: z.array(z.string()),
      }),
    )
    .min(1),
});
const providerSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["LIVE", "NOT_CONFIGURED", "ERROR"]),
      reason: z.string(),
    }),
  ),
});
export type ProviderReport = z.infer<
  typeof providerSchema
>["providers"][number];
async function json(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Service returned HTTP ${response.status}. Check the engine/runtime service and proxy configuration.`,
    );
  return response.json();
}
const modelName = (id: string) =>
  ({
    "qwen3-4b": "Qwen3 4B",
    "deepseek-r1-distill-qwen-7b": "DeepSeek R1 7B",
    "gemma-3-4b": "Gemma 3 4B",
  })[id] ?? id;
export function adaptEngineScreening(
  workload: Workload,
  response: ArchitecturesResponse,
): Snapshot {
  const data = screeningSchema.parse(response);
  return snapshotSchema.parse({
    id: `engine:${workload.id}`,
    source: "api",
    phase: "search",
    integration: "engine-screening",
    workload: workload.description,
    providers: [
      { name: "Daytona", role: "Benchmark runtime", connected: false },
      { name: "Nosana", role: "GPU compute provider", connected: false },
      { name: "DNSimple", role: "Production endpoint", connected: false },
    ],
    protocol: `Engine workload: ${workload.name}. ${workload.cases.length} representative cases. Screening values are uncalibrated predictions. Complete workload execution and engine-scored evidence must be connected before measured recommendations can be produced.`,
    candidateCatalog: data.candidateArchitectures.map((a) => ({
      id: a.id,
      name: a.name,
      topology: a.agents.map((agent) => modelName(agent.modelId)).join(" → "),
    })),
    configurations: data.screenedArchitectures.map((result) => {
      const a = result.architecture;
      const quality = Math.round(result.metrics.quality.score * 1000) / 10;
      return {
        id: a.id,
        name: a.name,
        topology: a.agents.map((agent) => ({
          model: modelName(agent.modelId),
          role: agent.role.toLowerCase(),
        })),
        compute: `${a.compute.requestedCpuCores ? `${a.compute.requestedCpuCores} CPU · ${a.compute.requestedMemoryMb} MiB requested · ` : ""}${a.compute.maxOutputTokensPerAgent} tokens/agent · ${a.compute.timeoutMsPerCase / 1000}s case budget`,
        evidence: "predicted",
        quality,
        latency: Math.round(result.metrics.latencyMs / 100) / 10,
        resource: {
          value: result.metrics.resource.relativeCompute,
          unit: "relative compute",
          estimated: true,
        },
        tests: null,
        breakdown: [
          {
            label: "Engine screening heuristic (not test evidence)",
            value: quality,
            weight: 1,
          },
        ],
        qualityExplanation: [
          ...result.metrics.quality.rationale,
          ...result.assumptions,
        ].join(" "),
        pareto: false,
        recommendation: null,
        selectedForBenchmark: true,
        status: "queued",
      };
    }),
  });
}
export async function searchEngineExample(): Promise<Snapshot> {
  const payload = z
    .object({
      workload: z
        .object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          cases: z.array(z.unknown()).min(1),
        })
        .passthrough(),
    })
    .parse(await json("/engine/api/demo-workload"));
  const workload = payload.workload as unknown as Workload;
  const response = await json("/engine/api/architectures", { workload });
  return adaptEngineScreening(workload, response as ArchitecturesResponse);
}
export async function getProviderReports(): Promise<ProviderReport[]> {
  return providerSchema.parse(await json("/runtime/api/providers")).providers;
}
