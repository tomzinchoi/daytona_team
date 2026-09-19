import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptEngineRun } from '../src/engine-adapter.js';
import { hash } from '../src/provenance.js';
import { DaytonaProvider } from '../src/providers/daytona.js';
import { configured, labFixture } from './fixtures.js';

const engineInput = {
  architecture: { id: 'a-standard', name: 'Qwen only', family: 'A', agents: [{ id: 'a', modelId: 'qwen3-4b', role: 'IMPLEMENTER', instruction: 'Return the complete corrected file.' }], topology: { kind: 'SINGLE', edges: [] }, outputAgentId: 'a', compute: { id: 'standard', requestedCpuCores: 4, requestedMemoryMb: 16384, accelerator: 'CPU_ONLY', maxOutputTokensPerAgent: 512, timeoutMsPerCase: 300000, maxConcurrentCases: 1, modelHosting: 'PROVIDER_MANAGED' } },
  benchmarkCase: { id: 'repair', title: 'Repair', instruction: 'Fix plusOne.', files: { 'solution.cjs': 'module.exports = x => x - 1;' }, editableFiles: ['solution.cjs'], evaluation: { files: { 'solution.test.cjs': "const test = require('node:test'); const assert = require('node:assert/strict'); test('plusOne', () => assert.equal(require('./solution.cjs')(1), 2));" }, buildCommand: { executable: 'node', args: ['--check', 'solution.cjs'] }, testCommand: { executable: 'node', args: ['--test', '--test-reporter=tap', 'solution.test.cjs'] }, expectedTests: 1 } },
};

test('engine adapter preserves role, source architecture identity and trusted coding fixture', () => {
  const result = adaptEngineRun(engineInput);
  assert.equal(result.architecture.sourceArchitectureHash, hash(engineInput.architecture));
  assert.equal(result.architecture.agents[0]?.role, 'IMPLEMENTER: Return the complete corrected file.');
  assert.equal(result.benchmarkCase.evaluator.type, 'node_tests');
  if (result.benchmarkCase.evaluator.type === 'node_tests') assert.deepEqual(result.benchmarkCase.evaluator.testFiles, engineInput.benchmarkCase.evaluation.files);
});

test('engine adapter rejects arbitrary commands, traversal and unsupported topology', () => {
  const command = structuredClone(engineInput); command.benchmarkCase.evaluation.buildCommand.args = ['-e', 'process.exit(0)'];
  assert.throws(() => adaptEngineRun(command));
  const path = { ...engineInput, benchmarkCase: { ...engineInput.benchmarkCase, files: { '../solution.cjs': 'x' } } };
  assert.throws(() => adaptEngineRun(path));
  const topology = structuredClone(engineInput); topology.architecture.outputAgentId = 'missing';
  assert.throws(() => adaptEngineRun(topology));
});

test('requested engine budgets cannot be silently replaced with lab budgets', async () => {
  const fixture = labFixture(); const input = structuredClone(engineInput); input.architecture.compute.maxOutputTokensPerAgent = 1536;
  const result = await new DaytonaProvider(configured(), () => fixture.client).runBenchmark(adaptEngineRun(input), { runId: 'test', transition() {} });
  assert.equal(result.error?.code, 'COMPUTE_POLICY_MISMATCH');
  assert.equal(result.measurement, 'NOT_AVAILABLE'); assert.equal(fixture.state.creates, 0);
});
