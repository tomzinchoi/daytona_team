import { Daytona, type CreateSandboxFromSnapshotParams } from '@daytona/sdk';
import type { Config } from '../config.js';
import { evaluationSchema, executionSchema, type BenchmarkResult, type RunRequest, type ProviderReport } from '../contracts.js';
import { emptyResult, hash, reporterSource, runnerHash, runnerSource } from '../provenance.js';
import { RuntimeFailure, type BenchmarkContext, type ComputeProvider } from './provider.js';

// Narrow ports enable unit tests. Production always uses the official SDK below.
export interface LabSandbox {
  id: string; cpu: number; memory: number; disk: number; gpu: number;
  fs: {
    createFolder(path: string, mode: string): Promise<void>;
    uploadFile(data: Buffer, path: string, timeout?: number): Promise<void>;
    downloadFile(path: string, timeout?: number): Promise<Buffer>;
  };
  process: { executeCommand(command: string, cwd?: string, env?: Record<string, string>, timeout?: number): Promise<{ exitCode: number; result: string }> };
  delete(timeout?: number, wait?: boolean): Promise<void>;
}
export interface LabSnapshot { id: string; name: string; state: string; cpu: number; mem: number; disk: number; gpu: number }
export interface LabClient {
  snapshot: { get(id: string): Promise<LabSnapshot>; list(query: { limit: number }): Promise<unknown> };
  create(params: CreateSandboxFromSnapshotParams, options: { timeout: number }): Promise<LabSandbox>;
  get(id: string): Promise<LabSandbox>;
  [Symbol.asyncDispose]?(): Promise<void>;
}
export function createDaytonaClient(config: Config): Daytona {
  return new Daytona({ apiKey: config.DAYTONA_API_KEY, apiUrl: config.DAYTONA_API_URL, target: config.DAYTONA_TARGET, requestTimeoutMs: 15000, otelEnabled: false });
}
const workdir = '/tmp/benchmark-lab';
export const sampling = Object.freeze({ temperature: 0, seed: 42, maxTokens: 512, contextSize: 4096 });

export class DaytonaProvider implements ComputeProvider {
  readonly id = 'daytona' as const;
  private client?: LabClient;
  private snapshot?: LabSnapshot;
  private readonly pendingCleanup = new Map<string, LabSandbox>();
  constructor(private readonly config: Config, private readonly clientFactory: () => LabClient = () => createDaytonaClient(config)) {}
  private sdk(): LabClient { return this.client ??= this.clientFactory(); }
  getCapabilities(): ProviderReport['capabilities'] {
    return { benchmark: true, sequentialAgents: true, localOpenModels: true, gpuTelemetry: false, models: ['qwen3-4b', 'deepseek-r1-distill-qwen-7b', 'gemma-3-4b'], snapshotConfigured: Boolean(this.config.DAYTONA_SNAPSHOT) };
  }
  async getStatus(): Promise<ProviderReport> {
    const report = (status: ProviderReport['status'], reason: string): ProviderReport => ({ id: this.id, kind: 'compute', status, reason, capabilities: this.getCapabilities() });
    if (!this.config.DAYTONA_API_KEY) return report('NOT_CONFIGURED', 'DAYTONA_API_KEY is not configured.');
    try {
      await this.sdk().snapshot.list({ limit: 1 });
      if (this.config.DAYTONA_SNAPSHOT) await this.pinnedSnapshot();
      return report('LIVE', this.config.DAYTONA_SNAPSHOT ? 'Daytona API and snapshot verified. Model readiness is checked inside each sandbox.' : 'Daytona API verified. DAYTONA_SNAPSHOT is still required for benchmarks.');
    } catch { return report('ERROR', 'Daytona API or benchmark snapshot could not be verified. Check credentials, network, region, and snapshot state.'); }
  }
  private async pinnedSnapshot(): Promise<LabSnapshot> {
    if (!this.config.DAYTONA_SNAPSHOT) throw new RuntimeFailure('SNAPSHOT_NOT_CONFIGURED', 'Set DAYTONA_SNAPSHOT to the prepared benchmark snapshot ID.');
    if (!this.snapshot) {
      const found = await this.sdk().snapshot.get(this.config.DAYTONA_SNAPSHOT);
      if (found.id !== this.config.DAYTONA_SNAPSHOT) throw new RuntimeFailure('IMMUTABLE_SNAPSHOT_REQUIRED', 'DAYTONA_SNAPSHOT must be an immutable snapshot ID, not a mutable name.');
      if (found.state !== 'active') throw new RuntimeFailure('SNAPSHOT_NOT_READY', 'The benchmark snapshot must be active.');
      if (found.gpu !== 0 || found.cpu < 1 || found.mem < 8) throw new RuntimeFailure('UNSUPPORTED_RESOURCES', 'This MVP requires a CPU snapshot with at least 8 GiB memory.');
      this.snapshot = found;
    }
    return this.snapshot;
  }
  async getLabPolicy() {
    const snapshot = await this.pinnedSnapshot();
    return { id: 'standard' as const, requestedCpuCores: snapshot.cpu, requestedMemoryMb: snapshot.mem * 1024, accelerator: 'CPU_ONLY' as const, maxOutputTokensPerAgent: this.config.BENCHMARK_MAX_TOKENS, timeoutMsPerCase: this.config.BENCHMARK_TIMEOUT_SECONDS * 1000, maxConcurrentCases: 1 as const, modelHosting: 'PROVIDER_MANAGED' as const };
  }
  async verifyLab(): Promise<{ ready: boolean; snapshotId: string; models: unknown; cleanup: string }> {
    const snapshot = await this.pinnedSnapshot();
    let sandbox: LabSandbox | undefined;
    try {
      sandbox = await this.sdk().create({ name: `atlas-preflight-${Date.now()}`, snapshot: snapshot.id, language: 'python', public: false, networkBlockAll: true, autoStopInterval: 5, autoDeleteInterval: 0, ttlMinutes: 10 }, { timeout: this.config.DAYTONA_PROVISION_TIMEOUT_SECONDS });
      this.pendingCleanup.set(sandbox.id, sandbox);
      if (sandbox.cpu !== snapshot.cpu || sandbox.memory !== snapshot.mem || sandbox.disk !== snapshot.disk) throw new RuntimeFailure('ENVIRONMENT_MISMATCH', 'Preflight resources do not match the pinned snapshot.');
      await sandbox.fs.createFolder(workdir, '700');
      await sandbox.fs.uploadFile(runnerSource, `${workdir}/runner.py`, 30);
      await sandbox.fs.uploadFile(Buffer.from(JSON.stringify({ architecture: { agents: ['qwen3-4b', 'deepseek-r1-distill-qwen-7b', 'gemma-3-4b'].map(model => ({ model })) }, benchmarkCase: { evaluator: { type: 'node_tests' } } })), `${workdir}/input.json`, 30);
      const check = await sandbox.process.executeCommand('python3 runner.py preflight input.json', workdir, undefined, 30);
      if (check.exitCode !== 0) throw new RuntimeFailure('RUNTIME_NOT_READY', 'Pinned snapshot failed Python, Node, llama-server, or model manifest preflight.');
      const manifest = JSON.parse((await sandbox.fs.downloadFile('/opt/models/manifest.json', 30)).toString('utf8'));
      return { ready: true, snapshotId: snapshot.id, models: manifest, cleanup: 'DELETED' };
    } finally {
      if (sandbox) { await sandbox.delete(60, true); this.pendingCleanup.delete(sandbox.id); }
    }
  }
  async runBenchmark(request: RunRequest, context: BenchmarkContext): Promise<BenchmarkResult> {
    const started = performance.now();
    const result = emptyResult(request, context.runId, this.config.BENCHMARK_TIMEOUT_SECONDS, this.config.BENCHMARK_MAX_TOKENS);
    const runSampling = { ...sampling, maxTokens: this.config.BENCHMARK_MAX_TOKENS };
    let sandbox: LabSandbox | undefined;
    let creationAttempted = false;
    const sandboxName = `benchmark-${context.runId}`;
    try {
      if (!this.config.DAYTONA_API_KEY) throw new RuntimeFailure('PROVIDER_NOT_CONFIGURED', 'DAYTONA_API_KEY is not configured.');
      const snapshot = await this.pinnedSnapshot();
      const constraints = request.architecture.constraints;
      if (constraints && (constraints.cpu !== snapshot.cpu || constraints.memoryMb !== snapshot.mem * 1024 || constraints.timeoutMs !== this.config.BENCHMARK_TIMEOUT_SECONDS * 1000 || constraints.maxTokens !== this.config.BENCHMARK_MAX_TOKENS)) {
        throw new RuntimeFailure('COMPUTE_POLICY_MISMATCH', 'Requested compute settings differ from the fixed lab snapshot, timeout, or token budget. Run only equivalent configurations; requests are never silently changed.');
      }
      result.provenance.snapshotId = snapshot.id;
      context.transition('PROVISIONING');
      creationAttempted = true;
      sandbox = await this.sdk().create({
        name: sandboxName, snapshot: snapshot.id, language: 'python', public: false,
        labels: { app: 'benchmark-lab', runId: context.runId },
        networkBlockAll: true, autoStopInterval: Math.ceil(this.config.BENCHMARK_TIMEOUT_SECONDS / 60) + 5,
        autoDeleteInterval: 0, ttlMinutes: Math.ceil(this.config.BENCHMARK_TIMEOUT_SECONDS / 60) + 15,
      }, { timeout: this.config.DAYTONA_PROVISION_TIMEOUT_SECONDS });
      this.pendingCleanup.set(sandbox.id, sandbox);
      result.provenance.sandboxId = sandbox.id;
      const resources = { cpu: sandbox.cpu, memory: sandbox.memory, disk: sandbox.disk };
      result.provenance.resources = resources;
      if (sandbox.cpu !== snapshot.cpu || sandbox.memory !== snapshot.mem || sandbox.disk !== snapshot.disk || sandbox.gpu !== 0) {
        throw new RuntimeFailure('ENVIRONMENT_MISMATCH', 'Sandbox resources differ from the pinned snapshot.');
      }
      result.provenance.environmentHash = hash({ snapshot: snapshot.id, resources, runnerHash, sampling: runSampling, timeoutSeconds: this.config.BENCHMARK_TIMEOUT_SECONDS, target: this.config.DAYTONA_TARGET });
      context.transition('PREPARING');
      await sandbox.fs.createFolder(workdir, '700');
      await sandbox.fs.uploadFile(runnerSource, `${workdir}/runner.py`, 30);
      await sandbox.fs.uploadFile(reporterSource, `${workdir}/test-reporter.mjs`, 30);
      await sandbox.fs.uploadFile(Buffer.from(JSON.stringify({
        architecture: request.architecture, benchmarkCase: request.benchmarkCase,
        settings: { ...runSampling, threads: snapshot.cpu, timeoutSeconds: this.config.BENCHMARK_TIMEOUT_SECONDS },
      })), `${workdir}/input.json`, 30);
      const prepared = await sandbox.process.executeCommand('python3 runner.py preflight input.json', workdir, undefined, 30);
      if (prepared.exitCode !== 0) throw new RuntimeFailure('RUNTIME_NOT_READY', 'Snapshot must include Python 3, llama-server, manifest, and the requested GGUF models. No model was run.');
      context.transition('RUNNING');
      const executed = await sandbox.process.executeCommand('python3 runner.py run input.json', workdir, undefined, this.config.BENCHMARK_TIMEOUT_SECONDS + 10);
      result.metrics.exitStatus = executed.exitCode;
      const execution = executionSchema.parse(JSON.parse((await sandbox.fs.downloadFile(`${workdir}/execution.json`, 30)).toString('utf8')));
      if ((execution.error === null) !== (executed.exitCode === 0)) throw new RuntimeFailure('INVALID_RUNTIME_RESULT', 'Runner exit status and execution artifact disagree.');
      if (execution.agents.some((agent, index) => agent.model !== request.architecture.agents[index]?.model || agent.role !== request.architecture.agents[index]?.role)) {
        throw new RuntimeFailure('INVALID_RUNTIME_RESULT', 'Runner agent order, models, or roles do not match the requested architecture.');
      }
      if (!execution.error && (execution.agents.length !== request.architecture.agents.length || execution.output !== execution.agents.at(-1)?.output)) {
        throw new RuntimeFailure('INVALID_RUNTIME_RESULT', 'Runner did not execute every requested agent.');
      }
      result.measurement = 'MEASURED';
      result.metrics.elapsedMs = execution.elapsedMs;
      result.metrics.memoryBytes = execution.peakChildRssBytes ?? null;
      result.output = execution.output;
      result.agents = execution.agents;
      result.provenance.modelManifest = execution.modelManifest;
      if (execution.error) {
        result.error = execution.error;
        if (request.benchmarkCase.evaluator.type === 'node_tests') {
          result.caseEvidence = { caseId: request.benchmarkCase.id, status: execution.error.code === 'BENCHMARK_TIMEOUT' ? 'TIMEOUT' : 'ERROR', buildSucceeded: false, tests: { passed: 0, failed: 0, skipped: request.benchmarkCase.evaluator.expectedTests }, buildExitStatus: null, testExitStatus: null };
        }
      } else {
        context.transition('EVALUATING');
        const evaluated = await sandbox.process.executeCommand('python3 runner.py evaluate input.json', workdir, undefined, 30);
        result.metrics.evaluatorExitStatus = evaluated.exitCode;
        const evaluation = evaluationSchema.parse(JSON.parse((await sandbox.fs.downloadFile(`${workdir}/evaluation.json`, 30)).toString('utf8')));
        if (![0, 1].includes(evaluated.exitCode) || evaluation.passed !== (evaluated.exitCode === 0) || evaluation.passed !== evaluation.checks.every(c => c.passed)) {
          throw new RuntimeFailure('INVALID_EVALUATOR_RESULT', 'Evaluator exit status and checks disagree.');
        }
        result.evaluator = evaluation;
        if (request.benchmarkCase.evaluator.type === 'node_tests') {
          const evidence = evaluation.caseEvidence;
          if (!evidence || evidence.caseId !== request.benchmarkCase.id || evidence.tests.passed + evidence.tests.failed + evidence.tests.skipped !== request.benchmarkCase.evaluator.expectedTests || (evaluation.passed && (!evidence.buildSucceeded || evidence.tests.passed !== request.benchmarkCase.evaluator.expectedTests))) {
            throw new RuntimeFailure('INVALID_EVALUATOR_RESULT', 'Coding test evidence is missing or does not match the fixture.');
          }
          result.caseEvidence = evidence;
        }
        result.success = evaluation.passed;
        result.status = evaluation.passed ? 'COMPLETED' : 'FAILED';
        if (!evaluation.passed) result.error = { code: 'EVALUATION_FAILED', message: 'The real model output failed the benchmark evaluator.' };
      }
    } catch (error) {
      result.status = 'FAILED'; result.success = false;
      // Infrastructure/protocol errors cannot be promoted to measured benchmark evidence.
      result.measurement = 'NOT_AVAILABLE';
      result.error = error instanceof RuntimeFailure ? { code: error.code, message: error.message } : { code: 'DAYTONA_EXECUTION_FAILED', message: 'Daytona provisioning, command execution, or result collection failed. No complete benchmark result is available.' };
    } finally {
      if (!sandbox && creationAttempted) {
        try { sandbox = await this.sdk().get(sandboxName); result.provenance.sandboxId = sandbox.id; }
        catch { result.cleanup = { status: 'FAILED', sandboxId: null }; }
      }
      if (sandbox) {
        this.pendingCleanup.set(sandbox.id, sandbox);
        try { await sandbox.delete(60, true); this.pendingCleanup.delete(sandbox.id); result.cleanup = { status: 'DELETED', sandboxId: sandbox.id }; }
        catch { result.cleanup = { status: 'FAILED', sandboxId: sandbox.id }; }
      }
      result.metrics.totalElapsedMs = Math.round(performance.now() - started);
    }
    return result;
  }
  async cleanup(): Promise<void> {
    const attempts = await Promise.allSettled([...this.pendingCleanup.values()].map(async sandbox => { await sandbox.delete(60, true); this.pendingCleanup.delete(sandbox.id); }));
    await this.client?.[Symbol.asyncDispose]?.();
    if (attempts.some(x => x.status === 'rejected')) throw new RuntimeFailure('CLEANUP_FAILED', 'One or more Daytona sandboxes could not be deleted; check the Daytona dashboard.');
  }
}
