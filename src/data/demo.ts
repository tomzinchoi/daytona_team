import type { Configuration, Phase, Snapshot } from "../domain";

// The only source of synthetic business data. Never presented as live execution.
export const DEMO_WORKLOAD =
  "Fix recurring bugs in this repository and make the tests pass.";
const rows: [string[], number, number, number][] = [
  [["Qwen"], 12.8, 60, 0.14],
  [["DeepSeek"], 23.4, 70, 0.3],
  [["Qwen", "Gemma"], 11.2, 80, 0.12],
  [["Gemma"], 8.9, 50, 0.09],
  [["DeepSeek", "Qwen"], 27.1, 75, 0.37],
  [["Qwen", "Qwen"], 19.4, 65, 0.25],
  [["Gemma", "Qwen"], 16.6, 70, 0.2],
  [["DeepSeek", "Qwen", "Gemma"], 18.7, 90, 0.23],
  [["DeepSeek", "Gemma"], 31.2, 85, 0.39],
  [["Qwen", "DeepSeek"], 25.2, 80, 0.35],
  [["Gemma", "Gemma"], 14.6, 55, 0.16],
  [["DeepSeek", "DeepSeek", "Gemma"], 29.4, 95, 0.42],
  [["Qwen", "Gemma", "Qwen"], 22.8, 75, 0.28],
  [["Gemma", "DeepSeek"], 34.1, 80, 0.46],
  [["DeepSeek", "Qwen", "Qwen"], 36.8, 85, 0.5],
];
const picks = new Map<number, Configuration["recommendation"]>([
  [3, "efficient"],
  [8, "balanced"],
  [12, "performance"],
]);
export function demoSnapshot(workload: string, phase: Phase): Snapshot {
  return {
    id: "demo-bugfix-001",
    workload,
    source: "demo",
    phase,
    protocol:
      "Illustrative protocol: identical repository snapshot · 20 test assertions · fixed task set. Quality = passed assertions ÷ 20 × 100. No sandbox has been executed.",
    providers: [
      { name: "Daytona", role: "Benchmark runtime", connected: false },
      { name: "Nosana", role: "GPU compute provider", connected: false },
      { name: "DNSimple", role: "Production endpoint", connected: false },
    ],
    configurations: rows.map(([models, latency, quality, resource], i) => {
      const n = i + 1,
        selected = picks.has(n),
        measured = phase === "results" && selected;
      return {
        id: String(n).padStart(2, "0"),
        name: `Architecture #${String(n).padStart(2, "0")}`,
        topology: models.map((model, j) => ({
          model,
          role:
            models.length === 1
              ? "Worker"
              : j === 0
                ? "Reasoner"
                : j === models.length - 1
                  ? "Reviewer"
                  : "Worker",
        })),
        compute:
          selected && n === 12 ? "8 vCPU · 16 GB RAM" : "4 vCPU · 8 GB RAM",
        evidence: measured ? "measured" : "predicted",
        latency,
        quality,
        resource: { value: resource, unit: "vCPU-min", estimated: true },
        tests: measured ? { passed: quality / 5, total: 20 } : null,
        qualityExplanation: measured
          ? "Illustrative test pass rate. Each of 20 assertions has equal weight. This is demo evidence, not a real execution."
          : "Predicted test pass rate from the demo fixture; no tests have run.",
        breakdown: [
          { label: "Test assertion pass rate", value: quality, weight: 1 },
        ],
        pareto: measured,
        recommendation: measured ? picks.get(n)! : null,
        selectedForBenchmark: selected,
        status: measured
          ? "completed"
          : phase === "benchmark" && selected
            ? n === 3
              ? "provisioning"
              : n === 8
                ? "running"
                : "evaluating"
            : "queued",
      };
    }),
  };
}
