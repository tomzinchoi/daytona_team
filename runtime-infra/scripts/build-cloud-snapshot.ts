import { Image } from '@daytona/sdk';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createDaytonaClient } from '../src/providers/daytona.js';
import { loadConfig } from '../src/config.js';

// Provisioning utility only. Benchmarks never download models or change their image.
const config = loadConfig();
const client = createDaytonaClient(config);
mkdirSync('.local', { recursive: true });
try {
  const name = 'atlas-lab-q4km-20260919-v1';
  const existing = (await client.snapshot.list({ limit: 100 })).items.find(s => s.name === name);
  if (existing) {
    writeFileSync('.local/snapshot.json', JSON.stringify({ id: existing.id, name, state: existing.state }));
    console.log(JSON.stringify({ id: existing.id, state: existing.state, reused: true }));
  } else {
    console.log(JSON.stringify({ action: 'cloud-build-started', name, resources: { cpu: 4, memory: 8, disk: 10 } }));
    const snapshot = await client.snapshot.create({ name, image: Image.fromDockerfile('infra/Dockerfile.cloud'), resources: { cpu: 4, memory: 8, disk: 10 } }, {
      timeout: 1800,
      onLogs: chunk => appendFileSync('.local/cloud-build.log', chunk),
    });
    writeFileSync('.local/snapshot.json', JSON.stringify({ id: snapshot.id, name, state: snapshot.state }));
    console.log(JSON.stringify({ id: snapshot.id, state: snapshot.state, cpu: snapshot.cpu, memory: snapshot.mem }));
  }
} catch (e) {
  const message = e instanceof Error ? e.message.replaceAll(config.DAYTONA_API_KEY ?? 'UNSET', '[redacted]') : 'Cloud build failed';
  writeFileSync('.local/build-error.json', JSON.stringify({ message }));
  console.error(message); process.exitCode = 1;
} finally { await client[Symbol.asyncDispose](); }
