import { loadConfig } from '../src/config.js';
import { createDaytonaClient } from '../src/providers/daytona.js';

const config = loadConfig();
const image = process.env.BENCHMARK_IMAGE;
if (!config.DAYTONA_API_KEY || !image || !/@sha256:[a-f0-9]{64}$/.test(image)) {
  console.error('Set DAYTONA_API_KEY and BENCHMARK_IMAGE to a pushed OCI image@sha256:digest first.');
  process.exitCode = 1;
} else {
  const client = createDaytonaClient(config);
  try {
    const snapshot = await client.snapshot.create({ name: process.env.BENCHMARK_SNAPSHOT_NAME || 'benchmark-lab-v1', image, resources: { cpu: 4, memory: 16, disk: 30 } }, { timeout: 600 });
    console.log(JSON.stringify({ snapshotId: snapshot.id, state: snapshot.state, nextStep: 'Set DAYTONA_SNAPSHOT to this snapshotId. Run smoke:daytona, then one real model benchmark.' }));
  } catch {
    console.error('Snapshot creation failed. Check image registry access, available quota, and the Daytona dashboard.'); process.exitCode = 1;
  } finally { await client[Symbol.asyncDispose](); }
}
