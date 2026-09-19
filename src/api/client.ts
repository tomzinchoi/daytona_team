import { snapshotSchema, type Snapshot } from "../domain";
import { isActiveModel } from '../active-models';

// Proposed integration contract. Sessions 1/2 can map their payloads here.
// No Daytona SDK or optimizer logic belongs in this frontend.
const base = (
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_API_BASE_URL || ""
).replace(/\/$/, "");
export const apiConfigured = Boolean(base);
async function request(path: string, init?: RequestInit): Promise<Snapshot> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `벤치마크 API 오류 (${response.status}). 다시 시도하거나 예시 데모를 확인해 주세요.`,
    );
  const result = snapshotSchema.safeParse(await response.json());
  if (!result.success || result.data.source !== "api")
    throw new Error(
      "API 결과 형식을 확인할 수 없습니다. 예시 데이터로 대체하지 않았습니다.",
    );
  if (result.data.configurations.some(c => c.topology.some(node => !isActiveModel(node.model))))
    throw new Error('현재 데모에 설정되지 않은 모델이 API 결과에 포함되어 있습니다. Gemma 4 E2B, Qwen 3.5 9B, GPT-OSS 20B만 표시할 수 있습니다.');
  return result.data;
}
export const benchmarkApi = {
  create: (workload: string) =>
    request("/benchmarks", {
      method: "POST",
      body: JSON.stringify({ workload }),
    }),
  get: (id: string) => request(`/benchmarks/${encodeURIComponent(id)}`),
  start: (id: string) =>
    request(`/benchmarks/${encodeURIComponent(id)}/run`, { method: "POST" }),
};
