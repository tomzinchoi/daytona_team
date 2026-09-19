import { z } from 'zod';
import { architectureSchema, benchmarkCaseSchema, modelSchema, runRequestSchema } from './contracts.js';
import { hash } from './provenance.js';

// An input adapter only; scoring and optimization remain in benchmark-engine.
const engineArchitecture = z.object({
  id: z.string(),
  agents: z.array(z.object({ id: z.string(), modelId: modelSchema, role: z.enum(['PLANNER', 'IMPLEMENTER', 'REVIEWER']), instruction: z.string() })).min(1).max(3),
  topology: z.object({ kind: z.enum(['SINGLE', 'SEQUENTIAL']), edges: z.array(z.object({ from: z.string(), to: z.string() })) }),
  outputAgentId: z.string(),
  compute: z.object({ requestedCpuCores: z.number().int().positive(), requestedMemoryMb: z.number().int().positive(), accelerator: z.literal('CPU_ONLY'), maxOutputTokensPerAgent: z.number().int().positive(), timeoutMsPerCase: z.number().int().positive(), maxConcurrentCases: z.literal(1), modelHosting: z.literal('PROVIDER_MANAGED') }),
}).passthrough().superRefine((a, ctx) => {
  if (new Set(a.agents.map(x => x.id)).size !== a.agents.length || a.outputAgentId !== a.agents.at(-1)?.id || a.topology.kind !== (a.agents.length === 1 ? 'SINGLE' : 'SEQUENTIAL') || a.topology.edges.length !== a.agents.length - 1 || a.topology.edges.some((edge, i) => edge.from !== a.agents[i]?.id || edge.to !== a.agents[i + 1]?.id)) {
    ctx.addIssue({ code: 'custom', message: 'Only ordered single/sequential architectures ending at the final agent are supported.' });
  }
});
const nodeCommand = z.object({ executable: z.literal('node'), args: z.array(z.string()) });
const engineCase = z.object({
  id: z.string(), instruction: z.string(), files: z.record(z.string(), z.string()), editableFiles: z.array(z.string()).length(1),
  evaluation: z.object({ files: z.record(z.string(), z.string()), buildCommand: nodeCommand, testCommand: nodeCommand, expectedTests: z.number().int().positive() }),
}).passthrough().superRefine((c, ctx) => {
  const build = c.evaluation.buildCommand.args; const tests = c.evaluation.testCommand.args;
  if (build.length !== 2 || build[0] !== '--check' || build[1] !== c.editableFiles[0] || tests.length !== 3 || tests[0] !== '--test' || tests[1] !== '--test-reporter=tap' || !Object.hasOwn(c.evaluation.files, tests[2]!)) {
    ctx.addIssue({ code: 'custom', message: 'Only node --check and node --test --test-reporter=tap with a trusted test file are supported. The lab replaces TAP with an event-based JSON reporter.' });
  }
});
export function adaptEngineRun(input: unknown) {
  const parsed = z.object({ provider: z.enum(['daytona', 'nosana']).default('daytona'), architecture: engineArchitecture, benchmarkCase: engineCase }).strict().parse(input);
  const original = (input as { architecture: unknown }).architecture;
  const a = parsed.architecture; const c = parsed.benchmarkCase;
  return runRequestSchema.parse({
    provider: parsed.provider,
    architecture: architectureSchema.parse({ id: a.id, agents: a.agents.map(agent => ({ model: agent.modelId, role: `${agent.role}: ${agent.instruction}` })), sourceArchitectureHash: hash(original), constraints: { cpu: a.compute.requestedCpuCores, memoryMb: a.compute.requestedMemoryMb, maxTokens: a.compute.maxOutputTokensPerAgent, timeoutMs: a.compute.timeoutMsPerCase } }),
    benchmarkCase: benchmarkCaseSchema.parse({ id: c.id, task: c.instruction, evaluator: { type: 'node_tests', files: c.files, editableFile: c.editableFiles[0], testFiles: c.evaluation.files, testFile: c.evaluation.testCommand.args[2], expectedTests: c.evaluation.expectedTests } }),
  });
}
