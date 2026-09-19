import { randomUUID } from 'node:crypto';
import type { BenchmarkResult, RunRecord, RunRequest, RunStatus } from './contracts.js';
import { emptyResult } from './provenance.js';
import { RuntimeFailure, type ComputeProvider } from './providers/provider.js';

interface Job { record: RunRecord; request: RunRequest; done: Promise<BenchmarkResult>; resolve(result: BenchmarkResult): void }
export class BenchmarkJobs {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: Job[] = [];
  private draining?: Promise<void>;
  private closing = false;
  constructor(private readonly providers: Record<RunRequest['provider'], ComputeProvider>, private readonly timeoutSeconds: number, private readonly capacity = 200, private readonly maxTokens = 512) {}
  submit(requests: RunRequest[], batchId: string | null = null): RunRecord[] {
    if (this.closing) throw new RuntimeFailure('SHUTTING_DOWN', 'The benchmark service is shutting down.');
    const required = this.jobs.size + requests.length - this.capacity;
    const groups = new Map<string, Job[]>();
    for (const job of this.jobs.values()) {
      const key = job.record.batchId ?? job.record.id;
      groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    const evictable = [...groups.values()].filter(group => group.every(job => job.record.result !== null));
    if (required > evictable.reduce((count, group) => count + group.length, 0)) throw new RuntimeFailure('QUEUE_FULL', 'The benchmark queue is full. Try again after existing runs finish.');
    // Evict whole completed batches, so polling never returns a misleading partial batch.
    let evicted = 0;
    for (const group of evictable) {
      if (evicted >= required) break;
      for (const job of group) { this.jobs.delete(job.record.id); evicted++; }
    }
    const created = requests.map(request => {
      const id = randomUUID(); const at = new Date().toISOString();
      const record: RunRecord = { id, batchId, status: 'QUEUED', createdAt: at, updatedAt: at, history: [{ status: 'QUEUED', at }], result: null };
      let resolve!: Job['resolve'];
      const done = new Promise<BenchmarkResult>(r => { resolve = r; });
      const job = { record, request: structuredClone(request), resolve, done };
      this.jobs.set(id, job); this.queue.push(job);
      return structuredClone(record);
    });
    this.startDrain();
    return created;
  }
  private startDrain(): void {
    if (!this.draining && this.queue.length) {
      this.draining = Promise.resolve().then(() => this.drain()).finally(() => { this.draining = undefined; this.startDrain(); });
    }
  }
  get(id: string): RunRecord | undefined { const record = this.jobs.get(id)?.record; return record ? structuredClone(record) : undefined; }
  batch(id: string): RunRecord[] { return [...this.jobs.values()].filter(j => j.record.batchId === id).map(j => structuredClone(j.record)); }
  wait(id: string): Promise<BenchmarkResult> { const job = this.jobs.get(id); if (!job) throw new RuntimeFailure('RUN_NOT_FOUND', 'Benchmark run not found.'); return job.done; }
  private transition(record: RunRecord, status: RunStatus): void {
    record.status = status; record.updatedAt = new Date().toISOString(); record.history.push({ status, at: record.updatedAt });
  }
  private async drain(): Promise<void> {
    while (this.queue.length) {
      const job = this.queue.shift()!;
      let result: BenchmarkResult;
      try {
        if (this.closing) throw new RuntimeFailure('SHUTTING_DOWN', 'Queued benchmark cancelled during shutdown.');
        result = await this.providers[job.request.provider].runBenchmark(job.request, { runId: job.record.id, transition: status => this.transition(job.record, status) });
      } catch (error) {
        result = emptyResult(job.request, job.record.id, this.timeoutSeconds, this.maxTokens);
        result.error = error instanceof RuntimeFailure ? { code: error.code, message: error.message } : { code: 'INTERNAL_RUNTIME_ERROR', message: 'The runtime could not complete this benchmark.' };
      }
      job.record.result = result;
      this.transition(job.record, result.status);
      job.resolve(result);
    }
  }
  async close(): Promise<void> {
    this.closing = true;
    await this.draining;
    const results = await Promise.allSettled(Object.values(this.providers).map(provider => provider.cleanup()));
    if (results.some(r => r.status === 'rejected')) throw new RuntimeFailure('CLEANUP_FAILED', 'Provider shutdown could not delete all sandboxes.');
  }
}
