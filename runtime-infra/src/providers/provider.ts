import type { BenchmarkResult, ProviderReport, RunRequest, RunStatus } from '../contracts.js';

export interface BenchmarkContext {
  runId: string;
  transition(status: Exclude<RunStatus, 'QUEUED' | 'COMPLETED' | 'FAILED'>): void;
}
export interface ComputeProvider {
  readonly id: RunRequest['provider'];
  getStatus(): Promise<ProviderReport>;
  getCapabilities(): ProviderReport['capabilities'];
  runBenchmark(request: RunRequest, context: BenchmarkContext): Promise<BenchmarkResult>;
  cleanup(): Promise<void>;
}
export interface PromotionRequest { architectureId: string; zone: string; hostname: string; deploymentHostname: string }
export interface NetworkProvider {
  getStatus(): Promise<ProviderReport>;
  getCapabilities(): ProviderReport['capabilities'];
  promote(request: PromotionRequest): Promise<never>;
}
export class RuntimeFailure extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
