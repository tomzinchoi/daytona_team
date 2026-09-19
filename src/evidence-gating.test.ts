import { describe, expect, it } from "vitest";
import { demoSnapshot, DEMO_WORKLOAD } from "./data/demo";
import { emptySnapshot, plottableConfigurations, snapshotSchema } from "./domain";
import { adaptEngineScreening } from "./api/services";
import { architecturesEndpoint } from "../benchmark-engine/src/api";
import { DEMO_WORKLOAD as ENGINE_WORKLOAD } from "../benchmark-engine/src/benchmark/demo";

describe("benchmark results require execution evidence", () => {
  it("starts with no configurations or synthetic performance metrics", () => {
    const empty = snapshotSchema.parse(emptySnapshot());
    expect(empty.source).toBe("empty");
    expect(empty.configurations).toEqual([]);
    expect(plottableConfigurations(empty.configurations, empty.source)).toEqual([]);
  });

  it("never treats demo data as a real measurement", () => {
    for (const phase of ["search", "benchmark", "results"] as const) {
      const snapshot = snapshotSchema.parse(demoSnapshot(DEMO_WORKLOAD, phase));
      expect(snapshot.configurations.some(c => c.evidence === "measured")).toBe(false);
    }
    const demo = demoSnapshot(DEMO_WORKLOAD, "results");
    demo.configurations[7].evidence = "measured";
    expect(snapshotSchema.safeParse(demo).success).toBe(false);
    demo.configurations[7].evidence = "illustrative";
    demo.source = "api";
    expect(snapshotSchema.safeParse(demo).success).toBe(false);
  });

  it("does not plot predicted scores returned by the real candidate engine", () => {
    const result = adaptEngineScreening(ENGINE_WORKLOAD, architecturesEndpoint({ workload: ENGINE_WORKLOAD }));
    expect(result.configurations).toHaveLength(3);
    expect(plottableConfigurations(result.configurations, result.source)).toEqual([]);
  });

  it("requires finished execution before plotting real metrics", () => {
    const config = demoSnapshot(DEMO_WORKLOAD, "results").configurations[7];
    config.evidence = "measured";
    config.status = "queued";
    expect(plottableConfigurations([config], "api")).toEqual([]);
    config.status = "completed";
    expect(plottableConfigurations([config], "api")).toEqual([config]);
  });
});
