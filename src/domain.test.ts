import { describe, expect, it } from "vitest";
import { demoSnapshot, DEMO_WORKLOAD } from "./data/demo";
import { snapshotSchema } from "./domain";
import { adaptEngineScreening } from "./api/services";
import { architecturesEndpoint } from "../benchmark-engine/src/api";
import { DEMO_WORKLOAD as ENGINE_WORKLOAD } from "../benchmark-engine/src/benchmark/demo";

describe("evidence integrity", () => {
  it("rejects nonfinite values that cannot be plotted", () => {
    const s = demoSnapshot(DEMO_WORKLOAD, "search");
    s.configurations[0].latency = Infinity;
    expect(snapshotSchema.safeParse(s).success).toBe(false);
    s.configurations[0].latency = 10;
    s.configurations[0].resource.value = Infinity;
    expect(snapshotSchema.safeParse(s).success).toBe(false);
  });
  it("all demo stages are typed, with measured evidence only at the result stage", () => {
    for (const phase of ["search", "benchmark", "results"] as const) {
      const s = snapshotSchema.parse(demoSnapshot(DEMO_WORKLOAD, phase));
      expect(s.configurations).toHaveLength(15);
      expect(
        s.configurations.filter((c) => c.evidence === "measured"),
      ).toHaveLength(phase === "results" ? 3 : 0);
      for (const c of s.configurations)
        if (c.tests)
          expect(c.quality).toBe((c.tests.passed / c.tests.total) * 100);
      expect(s.providers.every((p) => !p.connected)).toBe(true);
    }
  });
  it("rejects invented quality that does not match evidence", () => {
    const s = demoSnapshot(DEMO_WORKLOAD, "results");
    s.configurations[7].quality = 92;
    expect(snapshotSchema.safeParse(s).success).toBe(false);
  });
  it("rejects impossible tests and incompatible resource units", () => {
    const s = demoSnapshot(DEMO_WORKLOAD, "results");
    s.configurations[7].tests!.passed = 100;
    expect(snapshotSchema.safeParse(s).success).toBe(false);
    s.configurations[7].tests!.passed = 18;
    s.configurations[7].resource.unit = "USD";
    expect(snapshotSchema.safeParse(s).success).toBe(false);
  });
  it("adapts the actual engine contract, preserving 15 candidates and only returned predictions", () => {
    const response = architecturesEndpoint({ workload: ENGINE_WORKLOAD });
    const result = adaptEngineScreening(ENGINE_WORKLOAD, response);
    expect(result.candidateCatalog).toHaveLength(15);
    expect(result.configurations).toHaveLength(3);
    expect(result.configurations[0].latency).toBe(
      Math.round(response.screenedArchitectures[0].metrics.latencyMs / 100) /
        10,
    );
    expect(
      result.configurations.every(
        (c) =>
          c.evidence === "predicted" &&
          c.tests === null &&
          !c.pareto &&
          c.recommendation === null,
      ),
    ).toBe(true);
    expect(result.configurations[0].compute).toContain("tokens/agent");
    expect(result.configurations[0].resource.unit).toBe("relative compute");
  });
});
