import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createDaytonaClient, type LabSandbox } from '../src/providers/daytona.js';

const config = loadConfig();
if (!config.DAYTONA_API_KEY) {
  console.log(JSON.stringify({ status: 'SKIPPED', reason: 'DAYTONA_API_KEY is not configured. No live operations were attempted.' }));
} else {
  const client = createDaytonaClient(config);
  let sandbox: LabSandbox | undefined;
  const name = `benchmark-smoke-${randomUUID()}`;
  try {
    sandbox = await client.create({ name, ...(config.DAYTONA_SNAPSHOT ? { snapshot: config.DAYTONA_SNAPSHOT } : {}), language: 'python', public: false, networkBlockAll: true, autoDeleteInterval: 0, autoStopInterval: 5, ttlMinutes: 10 }, { timeout: config.DAYTONA_PROVISION_TIMEOUT_SECONDS });
    await sandbox.fs.createFolder('/tmp/benchmark-smoke', '700');
    await sandbox.fs.uploadFile(Buffer.from('import json\nfrom pathlib import Path\nassert 6 * 7 == 42\nPath("result.json").write_text(json.dumps({"answer": 42}))\n'), '/tmp/benchmark-smoke/check.py', 30);
    const execution = await sandbox.process.executeCommand('python3 check.py', '/tmp/benchmark-smoke', undefined, 30);
    if (execution.exitCode !== 0) throw new Error('Smoke command failed.');
    const result = JSON.parse((await sandbox.fs.downloadFile('/tmp/benchmark-smoke/result.json', 30)).toString('utf8'));
    if (result.answer !== 42) throw new Error('Smoke artifact mismatch.');
    console.log(JSON.stringify({ status: 'PASSED', sandboxId: sandbox.id, verified: ['create', 'createFolder', 'uploadFile', 'executeCommand', 'downloadFile'], modelInferenceVerified: false }));
  } catch {
    console.error(JSON.stringify({ status: 'FAILED', reason: 'Live Daytona smoke test failed. Check credentials, region, and sandbox configuration.' }));
    process.exitCode = 1;
  } finally {
    if (!sandbox) {
      try { sandbox = await client.get(name); } catch { /* Creation may have failed before allocation; TTL is a backstop. */ }
    }
    if (sandbox) {
      try { await sandbox.delete(60, true); console.log(JSON.stringify({ cleanup: 'DELETED', sandboxId: sandbox.id })); }
      catch { console.error(JSON.stringify({ cleanup: 'FAILED', sandboxId: sandbox.id })); process.exitCode = 1; }
    }
    await client[Symbol.asyncDispose]();
  }
}
