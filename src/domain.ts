import { z } from "zod";

export const configurationSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    topology: z.array(z.object({ model: z.string(), role: z.string() })).min(1),
    compute: z.string(),
    evidence: z.enum(["predicted", "measured"]),
    latency: z.number().finite().nonnegative(),
    quality: z.number().min(0).max(100),
    resource: z.object({
      value: z.number().finite().nonnegative(),
      unit: z.string(),
      estimated: z.boolean(),
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
    source: z.enum(["demo", "api"]),
    phase: z.enum(["search", "benchmark", "results"]),
    configurations: z.array(configurationSchema).min(1),
    providers: z.array(
      z.object({ name: z.string(), role: z.string(), connected: z.boolean() }),
    ),
    protocol: z.string(),
    candidateCatalog: z
      .array(
        z.object({ id: z.string(), name: z.string(), topology: z.string() }),
      )
      .optional(),
    integration: z.enum(["orchestrator", "engine-screening"]).optional(),
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
    if (
      new Set(s.configurations.map((c) => c.id)).size !==
      s.configurations.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Configuration IDs must be unique",
      });
    if (new Set(s.configurations.map((c) => c.resource.unit)).size > 1)
      ctx.addIssue({
        code: "custom",
        message: "Resource units must be comparable",
      });
  });
export type Configuration = z.infer<typeof configurationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Phase = Snapshot["phase"];
export const topologyLabel = (c: Configuration) =>
  c.topology.map((n) => n.model).join(" → ");
export const resourceLabel = (c: Configuration) =>
  `${c.resource.value.toFixed(2)} ${c.resource.unit}`;
