import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { DnsimpleProvider } from '../src/providers/dnsimple.js';
import { NosanaProvider } from '../src/providers/nosana.js';
import { request } from './fixtures.js';

test('Nosana stays NOT_CONFIGURED even when credentials are supplied', async () => {
  const provider = new NosanaProvider(loadConfig({ NOSANA_API_KEY: 'secret', NOSANA_MARKET_ID: 'market' }));
  assert.equal((await provider.getStatus()).status, 'NOT_CONFIGURED');
  assert.equal((await provider.runBenchmark({ ...request, provider: 'nosana' }, { runId: 'x', transition() {} })).measurement, 'NOT_AVAILABLE');
});

test('DNSimple defaults to sandbox and only verifies account identity', async () => {
  const calls: string[] = [];
  const provider = new DnsimpleProvider(loadConfig({ DNSIMPLE_TOKEN: 'secret', DNSIMPLE_ACCOUNT_ID: '123' }), async (url, options) => {
    calls.push(String(url)); assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify({ data: { account: { id: 123 } } }), { status: 200 });
  });
  const report = await provider.getStatus();
  assert.equal(report.status, 'LIVE'); assert.equal(report.capabilities.promotion, false);
  assert.deepEqual(calls, ['https://api.sandbox.dnsimple.com/v2/whoami']);
  await assert.rejects(provider.promote({ architectureId: 'x', zone: 'example.com', hostname: 'agent', deploymentHostname: 'app.example.com' }), /does not write DNS/);
});

test('DNSimple production mode is disabled and makes no API calls', async () => {
  const provider = new DnsimpleProvider(loadConfig({ DNSIMPLE_TOKEN: 'secret', DNSIMPLE_ACCOUNT_ID: '123', DNSIMPLE_ENVIRONMENT: 'production' }), async () => { throw new Error('must not call production'); });
  assert.equal((await provider.getStatus()).status, 'ERROR');
});
