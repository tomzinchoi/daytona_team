import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp({ config });
for (const event of ['SIGINT', 'SIGTERM'] as const) {
  process.once(event, () => { app.close().catch(() => { console.error('Runtime shutdown failed to clean up all sandboxes. Check Daytona.'); process.exitCode = 1; }); });
}
try {
  const address = await app.listen({ host: config.HOST, port: config.PORT });
  console.log(`Benchmark runtime listening at ${address}`);
} catch {
  console.error('Could not start benchmark runtime. Check server configuration and port availability.');
  process.exitCode = 1;
}
