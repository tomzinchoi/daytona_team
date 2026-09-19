import { z } from 'zod';

export const modelSchema = z.enum(['qwen3-4b', 'deepseek-r1-distill-qwen-7b', 'gemma-3-4b']);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const safePath = z.string().max(180).regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.\/-]*$/).refine(path => path.split('/').every(part => part !== '..' && part !== '.' && part !== ''), 'Use safe relative file paths.');
const fileMap = z.record(safePath, z.string().max(50000)).refine(files => Object.keys(files).length > 0 && Object.keys(files).length <= 20, 'Provide 1–20 files.');
export const nodeTestsSchema = z.object({
  type: z.literal('node_tests'),
  files: fileMap,
  editableFile: safePath,
  testFiles: fileMap,
  testFile: safePath,
  expectedTests: z.number().int().min(1).max(100),
}).strict().superRefine((value, ctx) => {
  if (!Object.hasOwn(value.files, value.editableFile) || !/\.(cjs|mjs|js)$/.test(value.editableFile)) ctx.addIssue({ code: 'custom', message: 'editableFile must be a JavaScript file in files.' });
  if (!Object.hasOwn(value.testFiles, value.testFile) || !/\.(cjs|mjs|js)$/.test(value.testFile)) ctx.addIssue({ code: 'custom', message: 'testFile must be a JavaScript file in testFiles.' });
  if (Object.keys(value.testFiles).some(path => Object.hasOwn(value.files, path))) ctx.addIssue({ code: 'custom', message: 'Trusted test files cannot overlap input files.' });
});
export const architectureSchema = z.object({
  id,
  agents: z.array(z.object({
    role: z.string().trim().min(1).max(2000),
    model: modelSchema,
  }).strict()).min(1).max(3),
  constraints: z.object({ cpu: z.number().int().positive(), memoryMb: z.number().int().positive(), maxTokens: z.number().int().positive(), timeoutMs: z.number().int().positive() }).strict().optional(),
  sourceArchitectureHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export const benchmarkCaseSchema = z.object({
  id,
  task: z.string().trim().min(1).max(20000),
  evaluator: z.discriminatedUnion('type', [
    z.object({ type: z.literal('exact_match'), expected: z.string().max(20000) }).strict(),
    z.object({ type: z.literal('contains_all'), expected: z.array(z.string().min(1).max(2000)).min(1).max(30) }).strict(),
    z.object({ type: z.literal('json_exact'), expected: z.json() }).strict(),
    nodeTestsSchema,
  ]),
}).strict();
export const runRequestSchema = z.object({
  provider: z.enum(['daytona', 'nosana']).default('daytona'),
  architecture: architectureSchema,
  benchmarkCase: benchmarkCaseSchema,
}).strict();
export const batchRequestSchema = z.object({
  provider: z.enum(['daytona', 'nosana']).default('daytona'),
  architectures: z.array(architectureSchema).min(1).max(3),
  benchmarkCases: z.array(benchmarkCaseSchema).min(1).max(10),
}).strict().superRefine((value, ctx) => {
  for (const key of ['architectures', 'benchmarkCases'] as const) {
    if (new Set(value[key].map(x => x.id)).size !== value[key].length) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'IDs must be unique within a batch.' });
    }
  }
});

export type Architecture = z.infer<typeof architectureSchema>;
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type RunRequest = z.infer<typeof runRequestSchema>;
export type RunStatus = 'QUEUED' | 'PROVISIONING' | 'PREPARING' | 'RUNNING' | 'EVALUATING' | 'COMPLETED' | 'FAILED';
export type ProviderState = 'LIVE' | 'NOT_CONFIGURED' | 'ERROR';
export interface ProviderReport {
  id: string;
  kind: 'compute' | 'network';
  status: ProviderState;
  reason: string;
  capabilities: Record<string, boolean | string | string[]>;
}
export interface RunError { code: string; message: string }
export interface BenchmarkResult {
  runId: string;
  provider: RunRequest['provider'];
  architectureId: string;
  benchmarkCaseId: string;
  status: 'COMPLETED' | 'FAILED';
  measurement: 'MEASURED' | 'NOT_AVAILABLE';
  success: boolean;
  metrics: {
    elapsedMs: number | null;
    totalElapsedMs: number;
    exitStatus: number | null;
    evaluatorExitStatus: number | null;
    memoryBytes: null;
    cpuUsagePercent: null;
    gpuUsagePercent: null;
  };
  evaluator: { passed: boolean; checks: { name: string; passed: boolean }[] } | null;
  caseEvidence: { caseId: string; status: 'COMPLETED' | 'TIMEOUT' | 'ERROR'; buildSucceeded: boolean; tests: { passed: number; failed: number; skipped: number }; buildExitStatus: number | null; testExitStatus: number | null } | null;
  output: string | null;
  agents: { model: string; role: string; output: string; elapsedMs: number }[];
  provenance: {
    sandboxId: string | null;
    snapshotId: string | null;
    environmentHash: string | null;
    fixtureHash: string;
    architectureHash: string;
    runnerHash: string;
    sourceArchitectureHash: string | null;
    maxTokensPerAgent: number;
    timeoutSeconds: number;
    resources: { cpu: number; memory: number; disk: number } | null;
    inference: 'local-llama.cpp';
    modelManifest: Record<string, unknown> | null;
  };
  cleanup: { status: 'NOT_NEEDED' | 'DELETED' | 'FAILED'; sandboxId: string | null };
  error: RunError | null;
}
export interface RunRecord {
  id: string;
  batchId: string | null;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  history: { status: RunStatus; at: string }[];
  result: BenchmarkResult | null;
}

export const executionSchema = z.object({
  protocolVersion: z.literal(1),
  elapsedMs: z.number().finite().nonnegative(),
  output: z.string().max(100000).nullable(),
  agents: z.array(z.object({
    model: modelSchema,
    role: z.string(),
    output: z.string().max(100000),
    elapsedMs: z.number().finite().nonnegative(),
  })).max(3),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  modelManifest: z.record(z.string(), z.unknown()),
});
export const evaluationSchema = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean() })).min(1),
  caseEvidence: z.object({
    caseId: id,
    status: z.enum(['COMPLETED', 'TIMEOUT', 'ERROR']),
    buildSucceeded: z.boolean(),
    tests: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }),
    buildExitStatus: z.number().int().nullable(),
    testExitStatus: z.number().int().nullable(),
  }).optional(),
});
