import type { Configuration, Phase, Snapshot } from "../domain";

// The only source of synthetic business data. Never presented as live execution.
export const DEMO_WORKLOAD =
  "저장소에서 반복되는 버그를 수정하고 테스트를 통과시키세요.";
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
      "예시 평가: 동일한 저장소 스냅샷 · 20개 테스트 · 고정 작업. 품질 = 통과 테스트 ÷ 20 × 100. 실제 샌드박스를 실행하지 않았습니다.",
    providers: [
      { name: "Daytona", role: "벤치마크 런타임", connected: false },
      { name: "Nosana", role: "GPU 컴퓨팅 서비스", connected: false },
      { name: "DNSimple", role: "서비스 엔드포인트", connected: false },
    ],
    configurations: rows.map(([models, latency, quality, resource], i) => {
      const n = i + 1,
        selected = picks.has(n),
        measured = phase === "results" && selected;
      return {
        id: String(n).padStart(2, "0"),
        name: `구성 #${String(n).padStart(2, "0")}`,
        topology: models.map((model, j) => ({
          model,
          role:
            models.length === 1
              ? "작업자"
              : j === 0
                ? "추론 담당"
                : j === models.length - 1
                  ? "검토자"
                  : "작업자",
        })),
        compute:
          selected && n === 12 ? "8 vCPU · 16 GB RAM" : "4 vCPU · 8 GB RAM",
        evidence: measured ? "illustrative" : "predicted",
        latency,
        quality,
        resource: { value: resource, unit: "vCPU-min", estimated: true },
        tests: measured ? { passed: quality / 5, total: 20 } : null,
        qualityExplanation: measured
          ? "20개 테스트를 같은 가중치로 계산한 예시 통과율입니다. 실제 실행 결과가 아닙니다."
          : "예시 데이터의 예상 테스트 통과율입니다. 실제 테스트는 실행하지 않았습니다.",
        breakdown: [
          { label: "테스트 통과율", value: quality, weight: 1 },
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
