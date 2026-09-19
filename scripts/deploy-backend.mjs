// Deploy the long-lived runtime separately from Vercel's short HTTP gateway.
// Run from repository root: node --env-file=runtime-infra/.env scripts/deploy-backend.mjs
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const requireRuntime = createRequire(new URL('../runtime-infra/package.json', import.meta.url));
const { Daytona } = requireRuntime('@daytona/sdk');
const statePath = new URL('../.vercel/backend-state.json', import.meta.url);
const state = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'));
const client = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, target: process.env.DAYTONA_TARGET || 'us', otelEnabled: false });
const save = () => writeFile(statePath, JSON.stringify(state, null, 2));
try {
  if (!process.env.DAYTONA_API_KEY || !process.env.NOSANA_API_KEY) throw new Error('Provider credentials missing.');
  let sandbox;
  if (state.sandboxId) {
    sandbox = await client.get(state.sandboxId);
    if (sandbox.state !== 'started') await client.start(sandbox, 90);
  } else {
    sandbox = await client.create({ name: 'atlas-api-host', language: 'typescript', public: false, autoStopInterval: 0, autoArchiveInterval: 0, labels: { app: 'atlas-api-host' } }, { timeout: 90 });
    state.sandboxId = sandbox.id;
    state.runtimeToken = randomBytes(32).toString('hex');
    await save();
  }
  console.log(JSON.stringify({ stage: 'host-ready', sandboxId: sandbox.id }));
  if (process.argv.includes('--host-only')) process.exitCode = 0;
  else {
    const tar = spawnSync('tar', ['-czf', '.vercel/backend-release.tgz', 'benchmark-engine/dist', 'benchmark-engine/package.json', 'runtime-infra/dist/src', 'runtime-infra/runtime', 'runtime-infra/package.json'], { encoding: 'utf8' });
    if (tar.status !== 0) throw new Error('Backend archive failed. Build engine and runtime first.');
    await sandbox.fs.createFolder('/home/daytona/atlas', '700');
    await sandbox.fs.uploadFile(await readFile('.vercel/backend-release.tgz'), '/home/daytona/atlas/release.tgz');
    const env = {
      DAYTONA_API_KEY: process.env.DAYTONA_API_KEY, NOSANA_API_KEY: process.env.NOSANA_API_KEY,
      DAYTONA_TARGET: process.env.DAYTONA_TARGET || 'us', RUNTIME_API_TOKEN: state.runtimeToken,
      ENGINE_API_URL: 'http://127.0.0.1:3002', HOST: '0.0.0.0', PORT: '3001',
      BENCHMARK_TIMEOUT_SECONDS: process.env.BENCHMARK_TIMEOUT_SECONDS || '300',
      BENCHMARK_MAX_TOKENS: process.env.BENCHMARK_MAX_TOKENS || '512',
      DAYTONA_PROVISION_TIMEOUT_SECONDS: process.env.DAYTONA_PROVISION_TIMEOUT_SECONDS || '120',
      ...(process.env.DAYTONA_SNAPSHOT ? { DAYTONA_SNAPSHOT: process.env.DAYTONA_SNAPSHOT } : {}),
    };
    await sandbox.fs.uploadFile(Buffer.from(Object.entries(env).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n')), '/home/daytona/atlas/runtime.env');
    const install = await sandbox.process.executeCommand('tar -xzf release.tgz && chmod 600 runtime.env && cd runtime-infra && npm install --omit=dev --ignore-scripts --no-audit --no-fund', '/home/daytona/atlas', undefined, 180);
    if (install.exitCode !== 0) throw new Error('Remote dependency install failed.');
    console.log(JSON.stringify({ stage: 'dependencies-ready' }));
    const launcher = `import { spawn } from 'node:child_process';\nconst processes = [['engine', 'benchmark-engine', ['dist/server.js'], {HOST:'0.0.0.0',PORT:'3002'}], ['runtime', 'runtime-infra', ['--env-file=../runtime.env','dist/src/server.js'], {}]];\nlet stopping=false; const children=new Set();\nfunction launch([name,cwd,args,env]){ const p=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:'inherit'}); children.add(p); p.on('exit',()=>{children.delete(p); if(!stopping)setTimeout(()=>launch([name,cwd,args,env]),3000);}); }\nfor(const item of processes)launch(item);\nfor(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;for(const p of children)p.kill('SIGTERM');});\n`;
    await sandbox.fs.uploadFile(Buffer.from(launcher), '/home/daytona/atlas/launch.mjs');
    // Explicitly update only our own process session; archive files are preserved.
    if (state.sessionId) {
      const stopped = await sandbox.process.executeCommand("pkill -TERM -f '^node launch.mjs$' || true", '/home/daytona/atlas', undefined, 20);
      if (stopped.exitCode !== 0) throw new Error('Could not stop prior API process.');
    }
    state.sessionId = `atlas-api-${Date.now()}`;
    await sandbox.process.createSession(state.sessionId);
    await sandbox.process.executeSessionCommand(state.sessionId, { command: 'cd /home/daytona/atlas && node launch.mjs', runAsync: true, suppressInputEcho: true });
    const runtime = await sandbox.getPreviewLink(3001);
    const engine = await sandbox.getPreviewLink(3002);
    state.runtimeUrl = runtime.url; state.engineUrl = engine.url;
    state.previewToken = runtime.token; state.enginePreviewToken = engine.token;
    await save();
    console.log(JSON.stringify({ stage: 'deployed', sandboxId: sandbox.id }));
  }
} catch (error) {
  const secrets = [process.env.DAYTONA_API_KEY, process.env.NOSANA_API_KEY, state.runtimeToken, state.previewToken].filter(Boolean);
  let message = error instanceof Error ? error.message : 'Deployment failed';
  for (const secret of secrets) message = message.replaceAll(secret, '[redacted]');
  console.error(message); process.exitCode = 1;
} finally { await client[Symbol.asyncDispose](); }
