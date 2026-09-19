import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { BenchmarkResult, RunRequest } from './contracts.js';

// Resolves from both src/ and dist/src/, independent of the process working directory.
const root = fileURLToPath(new URL(import.meta.url.includes('/dist/') ? '../../' : '../', import.meta.url));
export const runnerSource = readFileSync(resolve(root, 'runtime/runner.py'));
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export const runnerHash = createHash('sha256').update(runnerSource).digest('hex');
export function emptyResult(request: RunRequest, runId: string, timeoutSeconds: number): BenchmarkResult {
  return {
    runId, provider: request.provider, architectureId: request.architecture.id, benchmarkCaseId: request.benchmarkCase.id,
    status: 'FAILED', measurement: 'NOT_AVAILABLE', success: false,
    metrics: { elapsedMs: null, totalElapsedMs: 0, exitStatus: null, evaluatorExitStatus: null, memoryBytes: null, cpuUsagePercent: null, gpuUsagePercent: null },
    evaluator: null, output: null, agents: [],
    provenance: { sandboxId: null, snapshotId: null, environmentHash: null, fixtureHash: hash(request.benchmarkCase), architectureHash: hash(request.architecture), runnerHash, timeoutSeconds, resources: null, inference: 'local-llama.cpp', modelManifest: null },
    cleanup: { status: 'NOT_NEEDED', sandboxId: null }, error: null,
  };
}
