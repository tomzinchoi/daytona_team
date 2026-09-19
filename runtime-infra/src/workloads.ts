import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { adaptEngineRun } from './engine-adapter.js';
import type { BenchmarkJobs } from './jobs.js';
import type { BenchmarkResult, RunRecord } from './contracts.js';
import { RuntimeFailure } from './providers/provider.js';

const computeSchema = z.object({ id: z.enum(['compact', 'standard', 'extended']), requestedCpuCores: z.number().int().positive(), requestedMemoryMb: z.number().int().positive(), accelerator: z.literal('CPU_ONLY'), maxOutputTokensPerAgent: z.number().int().positive(), timeoutMsPerCase: z.number().int().positive(), maxConcurrentCases: z.literal(1), modelHosting: z.literal('PROVIDER_MANAGED') });
const architectureSchema = z.object({ id: z.string(), name: z.string(), compute: computeSchema }).passthrough();
const workloadSchema = z.object({ id: z.string(), description: z.string(), cases: z.array(z.object({ id: z.string() }).passthrough()).min(1).max(10) }).passthrough();
const screeningSchema = z.object({ candidateArchitectures: z.array(architectureSchema), screenedArchitectures: z.array(z.object({ architecture: architectureSchema }).passthrough()).min(1).max(3) }).passthrough();
type Architecture = z.infer<typeof architectureSchema>;
export type Experiment = {
  id: string; phase: 'search' | 'benchmark' | 'results'; createdAt: string;
  workload: z.infer<typeof workloadSchema>; screening: z.infer<typeof screeningSchema>;
  runs: { architectureId: string; caseId: string; record: RunRecord }[];
  results: Record<string, unknown>[]; recommendation: Record<string, unknown> | null;
  failures: Record<string, string>; warnings: string[]; started: boolean; finishedAt: string | null;
};
export type EngineCall = (path: string, body?: unknown) => Promise<unknown>;
export function engineClient(base: string): EngineCall {
  return async (path, body) => {
    let response: Response;
    try { response = await fetch(`${base.replace(/\/$/, '')}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) }); }
    catch { throw new RuntimeFailure('ENGINE_UNAVAILABLE', 'Benchmark engine is unavailable. Start the configured engine service.'); }
    const payload = await response.json() as { error?: { message?: string } };
    if (!response.ok) throw new RuntimeFailure('ENGINE_REJECTED_EVIDENCE', payload.error?.message ?? `Engine HTTP ${response.status}`);
    return payload;
  };
}

// Orchestration only: engine owns architecture generation, scoring, and recommendations.
export class WorkloadExperiments {
  private readonly experiments = new Map<string, Experiment>();
  private readonly active = new Map<string, Promise<void>>();
  private closing = false;
  constructor(private readonly jobs: BenchmarkJobs, private readonly engine: EngineCall, private readonly labPolicy: () => Promise<z.infer<typeof computeSchema>>, private readonly archiveDirectory = '.local/experiments') {}
  async create(workload?: unknown): Promise<Experiment> {
    if (this.experiments.size >= 50) throw new Error('Experiment capacity reached. Export results and restart the runtime.');
    const payload = workload ?? (await this.engine('/api/demo-workload') as { workload: unknown }).workload;
    const trusted = workloadSchema.parse(payload);
    const policy = computeSchema.parse(await this.labPolicy());
    const screening = screeningSchema.parse(await this.engine('/api/architectures', { workload: trusted, computeConfigs: [policy] }));
    // Validate all requests before an experiment can incur any execution costs.
    for (const pick of screening.screenedArchitectures) for (const benchmarkCase of trusted.cases) adaptEngineRun({ architecture: pick.architecture, benchmarkCase });
    const experiment: Experiment = { id: randomUUID(), createdAt: new Date().toISOString(), phase: 'search', workload: trusted, screening, runs: [], results: [], recommendation: null, failures: {}, warnings: [], started: false, finishedAt: null };
    this.experiments.set(experiment.id, experiment); await this.persist(experiment); return this.get(experiment.id)!;
  }
  get(id: string): Experiment | undefined {
    let experiment = this.experiments.get(id);
    if (!experiment && z.string().uuid().safeParse(id).success) {
      const path = `${this.archiveDirectory}/${id}.json`;
      if (existsSync(path)) {
        try {
          const saved = JSON.parse(readFileSync(path, 'utf8')) as Experiment;
          if (saved.id === id && ['search', 'benchmark', 'results'].includes(saved.phase)) {
            if (saved.phase === 'benchmark') { saved.phase = 'results'; saved.warnings.push('Runtime restarted before completion. Archived evidence is retained; unfinished executions were not resumed.'); }
            experiment = saved; this.experiments.set(id, saved);
          }
        } catch { return; }
      }
    }
    if (!experiment) return;
    const copy = structuredClone(experiment);
    copy.runs = copy.runs.map(run => ({ ...run, record: this.jobs.get(run.record.id) ?? run.record }));
    return copy;
  }
  start(id: string): Experiment {
    const experiment = this.experiments.get(id); if (!experiment) throw new Error('Experiment not found.');
    if (this.closing) throw new Error('Runtime is shutting down.');
    if (!experiment.started) {
      experiment.started = true; experiment.phase = 'benchmark';
      const done = this.execute(experiment).catch(error => { experiment.warnings.push(error instanceof Error ? error.message : 'Experiment failed.'); }).finally(async () => { experiment.phase = 'results'; experiment.finishedAt = new Date().toISOString(); await this.persist(experiment); this.active.delete(id); });
      this.active.set(id, done);
    }
    return this.get(id)!;
  }
  private async execute(experiment: Experiment): Promise<void> {
    for (const pick of experiment.screening.screenedArchitectures) {
      if (this.closing) { experiment.warnings.push('Runtime shutdown: remaining configurations were not executed.'); break; }
      const architecture = pick.architecture;
      const terminal: BenchmarkResult[] = [];
      for (const benchmarkCase of experiment.workload.cases) {
        if (this.closing) break;
        const request = adaptEngineRun({ architecture, benchmarkCase });
        const record = this.jobs.submit([request], experiment.id)[0]!;
        experiment.runs.push({ architectureId: architecture.id, caseId: benchmarkCase.id, record });
        await this.persist(experiment);
        const result = await this.jobs.wait(record.id);
        experiment.runs[experiment.runs.length - 1]!.record = this.jobs.get(record.id)!;
        await this.persist(experiment);
        if (result.measurement !== 'MEASURED' || !result.caseEvidence) {
          experiment.failures[architecture.id] = `${result.error?.code ?? 'NOT_AVAILABLE'}: ${result.error?.message ?? 'No complete case evidence.'}`;
          break;
        }
        terminal.push(result);
      }
      if (terminal.length !== experiment.workload.cases.length) continue;
      try {
        const result = await this.aggregate(experiment, architecture, terminal);
        experiment.results.push(result);
        // Progressive updates: measured points replace predictions after each complete workload.
        experiment.recommendation = z.record(z.string(), z.unknown()).parse(await this.engine('/api/recommend', { workload: experiment.workload, results: experiment.results }));
      } catch (error) { experiment.failures[architecture.id] = error instanceof Error ? error.message : 'Evidence aggregation failed.'; }
      await this.persist(experiment);
    }
    if (!experiment.results.length) experiment.warnings.push('No complete measured workload is available. Failed infrastructure runs were not converted to benchmark scores.');
  }
  private async aggregate(experiment: Experiment, architecture: Architecture, runs: BenchmarkResult[]): Promise<Record<string, unknown>> {
    const memoryAvailable = runs.every(run => typeof run.metrics.memoryBytes === 'number' && run.metrics.memoryBytes > 0);
    const resource = memoryAvailable ? {
      costUsd: null, computeTimeMs: null, computeTimeBasis: null,
      peakMemoryMb: Math.max(...runs.map(run => run.metrics.memoryBytes!)) / 1024 / 1024,
      measurementContext: 'Linux getrusage(RUSAGE_CHILDREN).ru_maxrss of reaped sequential llama-server processes, max across workload cases, MiB. Includes model loading; excludes provisioning/evaluator and parent Python RSS. Not allocation or cost.',
    } : undefined;
    const response = await this.engine('/api/results/aggregate', {
      id: `${experiment.id}:${architecture.id}`, workload: experiment.workload, architecture,
      provider: { id: 'daytona', name: 'Daytona', status: 'READY', executionEnvironment: 'DAYTONA', detail: 'Actual pinned-snapshot workload execution.' },
      measuredAt: new Date().toISOString(), runs, ...(resource ? { resource } : {}),
    });
    return z.object({ result: z.record(z.string(), z.unknown()) }).parse(response).result;
  }
  private async persist(experiment: Experiment): Promise<void> {
    try { await mkdir(this.archiveDirectory, { recursive: true }); await writeFile(`${this.archiveDirectory}/${experiment.id}.json`, JSON.stringify(this.get(experiment.id) ?? experiment, null, 2)); }
    catch { if (!experiment.warnings.includes('Local evidence archive could not be written.')) experiment.warnings.push('Local evidence archive could not be written.'); }
  }
  async close(): Promise<void> { this.closing = true; await Promise.allSettled([...this.active.values()]); }
}
