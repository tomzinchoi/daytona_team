import { snapshotSchema, type Snapshot } from '../domain';

// Proposed integration contract. Sessions 1/2 can map their payloads here.
// No Daytona SDK or optimizer logic belongs in this frontend.
const base = ((import.meta as unknown as { env: Record<string, string> }).env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const apiConfigured = Boolean(base);
async function request(path: string, init?: RequestInit): Promise<Snapshot> {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Benchmark API returned ${response.status}. Please retry or open the labeled demo.`);
  const result = snapshotSchema.safeParse(await response.json());
  if (!result.success || result.data.source !== 'api') throw new Error('The benchmark API returned an unsupported evidence contract. No results were substituted.');
  return result.data;
}
export const benchmarkApi = {
  create: (workload: string) => request('/benchmarks', { method: 'POST', body: JSON.stringify({ workload }) }),
  get: (id: string) => request(`/benchmarks/${encodeURIComponent(id)}`),
  start: (id: string) => request(`/benchmarks/${encodeURIComponent(id)}/run`, { method: 'POST' }),
};
