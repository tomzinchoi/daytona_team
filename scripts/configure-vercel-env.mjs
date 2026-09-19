// Secrets travel through stdin, never command arguments or logs.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
const local = parseEnv(await readFile('runtime-infra/.env', 'utf8'));
const state = JSON.parse(await readFile('.vercel/backend-state.json', 'utf8'));
const values = {
  DAYTONA_API_KEY: local.DAYTONA_API_KEY, NOSANA_API_KEY: local.NOSANA_API_KEY,
  RUNTIME_API_URL: state.runtimeUrl, ENGINE_API_URL: state.engineUrl,
  RUNTIME_API_TOKEN: state.runtimeToken, RUNTIME_PREVIEW_TOKEN: state.previewToken,
  ENGINE_PREVIEW_TOKEN: state.enginePreviewToken,
};
for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`${name} missing; deploy the backend first.`);
  const command = `pnpm dlx vercel env add ${name} production --sensitive --yes --force`;
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { input: value, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) { console.error(`Could not save ${name}; CLI exit ${result.status}.`); process.exit(1); }
  console.log(`${name}: saved to production (secret)`);
}
