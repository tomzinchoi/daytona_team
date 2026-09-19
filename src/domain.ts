import { z } from "zod";

export const configurationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    topology: z.array(z.object({ model: z.string(), role: z.string() })).min(1),
    compute: z.string(),
    evidence: z.enum(["predicted", "measured", "illustrative"]),
    latency: z.number().finite().nonnegative(),
    quality: z.number().min(0).max(100),
    resource: z.object({
      value: z.number().finite().nonnegative(),
      unit: z.string(),
      estimated: z.boolean(),
      basis: z.enum(["predicted", "measured", "requested"]).optional(),
    }),
    tests: z
      .object({
        passed: z.number().int().nonnegative(),
        total: z.number().int().positive(),
      })
      .nullable(),
    qualityExplanation: z.string().min(1),
    breakdown: z
      .array(
        z.object({
          label: z.string(),
          value: z.number().min(0).max(100),
          weight: z.number().min(0).max(1),
        }),
      )
      .min(1),
    pareto: z.boolean(),
    recommendation: z.enum(["performance", "balanced", "efficient"]).nullable(),
    selectedForBenchmark: z.boolean(),
    status: z.enum([
      "queued",
      "provisioning",
      "running",
      "evaluating",
      "completed",
      "failed",
    ]),
    error: z.string().optional(),
    progress: z.object({ completed: z.number().int(), total: z.number().int(), currentCase: z.string().nullable() }).optional(),
    provenance: z.object({ resultId: z.string(), workloadFingerprint: z.string(), measuredAt: z.string(), runIds: z.array(z.string()), snapshotId: z.string().nullable(), measurementContext: z.string() }).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.tests && c.tests.passed > c.tests.total)
      ctx.addIssue({ code: "custom", message: "Passed tests exceed total" });
    const weights = c.breakdown.reduce((n, b) => n + b.weight, 0);
    const score = c.breakdown.reduce((n, b) => n + b.weight * b.value, 0);
    if (Math.abs(weights - 1) > 0.001 || Math.abs(score - c.quality) > 0.11)
      ctx.addIssue({
        code: "custom",
        message: "Quality must match its weighted breakdown",
      });
  });
export const snapshotSchema = z
  .object({
    id: z.string(),
    workload: z.string(),
    source: z.enum(["empty", "demo", "api"]),
    phase: z.enum(["search", "benchmark", "results"]),
    configurations: z.array(configurationSchema),
    providers: z.array(
      z.object({ name: z.string(), role: z.string(), connected: z.boolean() }),
    ),
    protocol: z.string(),
    candidateCatalog: z
      .array(
        z.object({ id: z.string(), name: z.string(), topology: z.string() }),
      )
      .optional(),
    integration: z.enum(["orchestrator", "engine-screening", "runtime-workload"]).optional(),
    warnings: z.array(z.string()).optional(),
    resourceAxis: z.string().optional(),
    recommendations: z
      .array(
        z.object({
          category: z.enum(["performance", "balanced", "efficient"]),
          configurationId: z.string(),
        }),
      )
      .optional(),
  })
  .superRefine((s, ctx) => {
    if (s.source === "empty" ? s.configurations.length !== 0 : s.configurations.length === 0)
      ctx.addIssue({ code: "custom", message: "Only the empty state can have no configurations" });
    if (s.configurations.some(c => (s.source === "demo" && c.evidence === "measured") || (s.source === "api" && c.evidence === "illustrative")))
      ctx.addIssue({ code: "custom", message: "Illustrative data and real measurements cannot share evidence labels" });
    if (
      new Set(s.configurations.map((c) => c.id)).size !==
      s.configurations.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Configuration IDs must be unique",
      });
    if (new Set(s.configurations.filter(c => s.source !== "api" || c.evidence === "measured").map((c) => c.resource.unit)).size > 1)
      ctx.addIssue({
        code: "custom",
        message: "Resource units must be comparable",
      });
  });
export type Configuration = z.infer<typeof configurationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Phase = Snapshot["phase"];
export function emptySnapshot(): Snapshot {
  return {
    id: "not-started", source: "empty", phase: "search", workload: "",
    configurations: [],
    providers: [
      { name: "Daytona", role: "벤치마크 실행 환경", connected: false },
      { name: "Nosana", role: "GPU 모델 추론", connected: false },
      { name: "DNSimple", role: "배포 도메인 연결", connected: false },
    ],
    protocol: "아직 워크로드를 실행하지 않았습니다. 성능 점수·지연 시간·추천은 실제 모델 실행과 평가가 끝난 뒤에만 표시합니다.",
  };
}
export const plottableConfigurations = (configurations: Configuration[], source: Snapshot["source"]) =>
  source === "demo" ? configurations : configurations.filter(c => c.evidence === "measured" && (c.status === "completed" || c.status === "failed"));
export const topologyLabel = (c: Configuration) =>
  c.topology.map((n) => n.model).join(" → ");
export const resourceLabel = (c: Configuration) =>
  `${c.resource.value.toFixed(2)} ${c.resource.unit}`;
