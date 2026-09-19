import type { Config } from '../config.js';
import type { ProviderReport, RunRequest } from '../contracts.js';
import { emptyResult } from '../provenance.js';
import type { BenchmarkContext, ComputeProvider } from './provider.js';

export class NosanaProvider implements ComputeProvider {
  readonly id = 'nosana' as const;
  constructor(private readonly config: Config) {}
  getCapabilities(): ProviderReport['capabilities'] { return { benchmark: false, gpuExecution: false, integration: 'adapter-only' }; }
  async getStatus(): Promise<ProviderReport> {
    return { id: this.id, kind: 'compute', status: 'NOT_CONFIGURED', capabilities: this.getCapabilities(), reason: this.config.NOSANA_API_KEY ? 'Credentials supplied; Nosana job submission, artifact collection, and cleanup are not implemented.' : 'Nosana credentials and job configuration are not configured.' };
  }
  async runBenchmark(request: RunRequest, context: BenchmarkContext) {
    const result = emptyResult(request, context.runId, this.config.BENCHMARK_TIMEOUT_SECONDS, this.config.BENCHMARK_MAX_TOKENS);
    result.error = { code: 'PROVIDER_NOT_CONFIGURED', message: (await this.getStatus()).reason };
    return result;
  }
  async cleanup(): Promise<void> { /* No jobs are submitted by this adapter. */ }
}
