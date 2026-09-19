import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { z } from 'zod';
import { loadConfig, type Config } from './config.js';
import { batchRequestSchema, runRequestSchema, type RunRequest } from './contracts.js';
import { BenchmarkJobs } from './jobs.js';
import { DaytonaProvider } from './providers/daytona.js';
import { NosanaProvider } from './providers/nosana.js';
import { DnsimpleProvider } from './providers/dnsimple.js';
import { RuntimeFailure, type ComputeProvider, type NetworkProvider } from './providers/provider.js';
import { adaptEngineRun } from './engine-adapter.js';
import { engineClient, WorkloadExperiments } from './workloads.js';

export function buildApp(options: { config?: Config; compute?: Record<RunRequest['provider'], ComputeProvider>; network?: NetworkProvider } = {}) {
  const config = options.config ?? loadConfig();
  const compute = options.compute ?? { daytona: new DaytonaProvider(config), nosana: new NosanaProvider(config) };
  const network = options.network ?? new DnsimpleProvider(config);
  const jobs = new BenchmarkJobs(compute, config.BENCHMARK_TIMEOUT_SECONDS, 200, config.BENCHMARK_MAX_TOKENS);
  const experiments = new WorkloadExperiments(jobs, engineClient(process.env.ENGINE_API_URL ?? 'http://127.0.0.1:3002'), async () => {
    if (!(compute.daytona instanceof DaytonaProvider)) throw new RuntimeFailure('LAB_NOT_AVAILABLE', 'The configured provider does not expose a pinned lab policy.');
    return compute.daytona.getLabPolicy();
  });
  const app = Fastify({ bodyLimit: 256 * 1024, logger: false, requestTimeout: 15000 });
  const digest = (value: string) => createHash('sha256').update(value).digest();
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (config.RUNTIME_API_TOKEN && request.url !== '/health') {
      const supplied = request.headers.authorization ?? '';
      if (!timingSafeEqual(digest(supplied), digest(`Bearer ${config.RUNTIME_API_TOKEN}`))) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'A valid runtime bearer token is required.' } });
      }
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Invalid benchmark request.', fields: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) } });
    if (error instanceof RuntimeFailure) return reply.code(error.code === 'QUEUE_FULL' ? 429 : error.code === 'RUN_NOT_FOUND' ? 404 : 503).send({ error: { code: error.code, message: error.message } });
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 500).send({ error: { code: 'REQUEST_FAILED', message: 'The server could not process this request.' } });
  });
  app.get('/health', async () => ({ status: 'ok', service: 'benchmark-runtime' }));
  app.get('/api/providers', async () => ({ providers: await Promise.all([compute.daytona.getStatus(), compute.nosana.getStatus(), network.getStatus()]) }));
  app.post('/api/benchmark/readiness', async () => {
    if (!(compute.daytona instanceof DaytonaProvider)) throw new RuntimeFailure('LAB_NOT_AVAILABLE', 'Daytona lab is unavailable.');
    return compute.daytona.verifyLab();
  });
  app.post('/api/workloads/example', async () => experiments.create());
  app.post('/api/workloads', async request => { const input = z.object({ workload: z.unknown() }).strict().parse(request.body); return experiments.create(input.workload); });
  app.get('/api/workloads/:id', async (request, reply) => { const { id } = z.object({ id: z.string().uuid() }).parse(request.params); const experiment = experiments.get(id); return experiment ?? reply.code(404).send({ error: { code: 'EXPERIMENT_NOT_FOUND', message: 'Experiment not found in this runtime session.' } }); });
  app.post('/api/workloads/:id/run', async (request, reply) => { const { id } = z.object({ id: z.string().uuid() }).parse(request.params); if (!experiments.get(id)) return reply.code(404).send({ error: { code: 'EXPERIMENT_NOT_FOUND', message: 'Unknown experiment.' } }); return reply.code(202).send(experiments.start(id)); });
  app.get('/api/benchmark/policy', async () => ({
    timeoutSeconds: config.BENCHMARK_TIMEOUT_SECONDS, maxTokensPerAgent: config.BENCHMARK_MAX_TOKENS,
    temperature: 0, seed: 42, contextSize: 4096, concurrency: 1,
    resourcePolicy: 'Every run inherits the same immutable Daytona snapshot; incompatible architecture constraints are rejected.',
    evaluatorTimeoutSeconds: 20,
  }));
  app.post('/api/benchmark/run', async (request, reply) => {
    const query = z.object({ wait: z.enum(['true', 'false']).default('false') }).strict().parse(request.query);
    const input = runRequestSchema.parse(request.body);
    const record = jobs.submit([input])[0]!;
    reply.header('Location', `/api/benchmark/runs/${record.id}`);
    if (query.wait === 'true') {
      const result = await jobs.wait(record.id);
      return reply.code(result.measurement === 'NOT_AVAILABLE' ? 503 : 200).send(result);
    }
    return reply.code(202).send({ ...record, statusUrl: `/api/benchmark/runs/${record.id}` });
  });
  app.post('/api/benchmark/engine/run', async (request, reply) => {
    const input = adaptEngineRun(request.body);
    const record = jobs.submit([input])[0]!;
    reply.header('Location', `/api/benchmark/runs/${record.id}`);
    return reply.code(202).send({ ...record, statusUrl: `/api/benchmark/runs/${record.id}` });
  });
  app.get('/api/benchmark/runs/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const record = jobs.get(id);
    if (!record) return reply.code(404).send({ error: { code: 'RUN_NOT_FOUND', message: 'Unknown or expired benchmark run.' } });
    return record;
  });
  app.post('/api/benchmark/batch', async (request, reply) => {
    const input = batchRequestSchema.parse(request.body);
    const batchId = randomUUID();
    const requests = input.architectures.flatMap(architecture => input.benchmarkCases.map(benchmarkCase => ({ provider: input.provider, architecture, benchmarkCase })));
    const records = jobs.submit(requests, batchId);
    reply.header('Location', `/api/benchmark/batches/${batchId}`);
    return reply.code(202).send({ batchId, statusUrl: `/api/benchmark/batches/${batchId}`, runs: records });
  });
  app.get('/api/benchmark/batches/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const runs = jobs.batch(id);
    if (!runs.length) return reply.code(404).send({ error: { code: 'BATCH_NOT_FOUND', message: 'Unknown or expired benchmark batch.' } });
    return { batchId: id, completed: runs.every(r => r.result !== null), runs };
  });
  app.addHook('onClose', async () => { await experiments.close(); await jobs.close(); });
  return app;
}
