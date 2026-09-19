import { loadConfig } from '../src/config.js';
import { runRequestSchema } from '../src/contracts.js';
import type { LabClient, LabSandbox } from '../src/providers/daytona.js';

export const request = runRequestSchema.parse({ architecture: { id: 'qwen-single', agents: [{ model: 'qwen3-4b', role: 'Solve the task.' }] }, benchmarkCase: { id: 'answer', task: 'Return 42.', evaluator: { type: 'exact_match', expected: '42' } } });
export const configured = () => loadConfig({ DAYTONA_API_KEY: 'unit-test-secret', DAYTONA_SNAPSHOT: 'snapshot-id' });
export function labFixture() {
  const commands: { command: string; timeout: number | undefined }[] = [];
  const uploads = new Map<string, Buffer>();
  const snapshot = { id: 'snapshot-id', name: 'lab-v1', state: 'active', cpu: 4, mem: 16, disk: 30, gpu: 0 };
  const state = { creates: 0, deletes: 0, gets: 0, preparedExit: 0, executionExit: 0, evaluatorExit: 0, deleteFails: false, createFails: false, downloadFails: false, options: {} as Record<string, unknown> };
  const execution = { protocolVersion: 1, elapsedMs: 125, output: '42', agents: [{ model: 'qwen3-4b', role: 'Solve the task.', output: '42', elapsedMs: 125 }], error: null as null | { code: string; message: string }, modelManifest: { models: { 'qwen3-4b': { sha256: 'a'.repeat(64) } } } };
  const evaluation = { passed: true, checks: [{ name: 'exact_match', passed: true }] };
  const sandbox: LabSandbox = {
    id: 'test-sandbox', cpu: 4, memory: 16, disk: 30, gpu: 0,
    fs: {
      async createFolder() {},
      async uploadFile(data, path) { uploads.set(path, data); },
      async downloadFile(path) {
        if (state.downloadFails) throw new Error('download failure with secret');
        return Buffer.from(JSON.stringify(path.endsWith('execution.json') ? execution : evaluation));
      },
    },
    process: { async executeCommand(command, _cwd, _env, timeout) {
      commands.push({ command, timeout });
      return { exitCode: command.includes('preflight') ? state.preparedExit : command.includes('evaluate') ? state.evaluatorExit : state.executionExit, result: '' };
    } },
    async delete(timeout, wait) { state.deletes++; if (timeout !== 60 || wait !== true) throw new Error('Deletion must wait for confirmation.'); if (state.deleteFails) throw new Error('delete failed'); },
  };
  const client: LabClient = {
    snapshot: { async get() { return snapshot; }, async list() { return { items: [snapshot] }; } },
    async create(params) { state.creates++; state.options = params; if (state.createFails) throw new Error('unit-test-secret'); return sandbox; },
    async get() { state.gets++; return sandbox; },
  };
  return { client, state, commands, uploads, sandbox, snapshot, execution, evaluation };
}
