import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DaytonaProvider } from '../src/providers/daytona.js';
import { NosanaProvider } from '../src/providers/nosana.js';
import { configured, labFixture, request } from './fixtures.js';

test('credential-free API exposes truthful statuses and asynchronous failed run', async () => {
  const app = buildApp({ config: loadConfig({}) });
  try {
    const providers = await app.inject({ method: 'GET', url: '/api/providers' });
    assert.equal(providers.statusCode, 200);
    assert.deepEqual(providers.json().providers.map((x: { status: string }) => x.status), ['NOT_CONFIGURED', 'NOT_CONFIGURED', 'NOT_CONFIGURED']);
    const submitted = await app.inject({ method: 'POST', url: '/api/benchmark/run', payload: request });
    assert.equal(submitted.statusCode, 202); assert.equal(submitted.json().status, 'QUEUED');
    await new Promise(resolve => setImmediate(resolve));
    const polled = await app.inject({ method: 'GET', url: submitted.json().statusUrl });
    assert.equal(polled.json().status, 'FAILED');
    assert.equal(polled.json().result.measurement, 'NOT_AVAILABLE');
    assert.equal(polled.json().result.metrics.elapsedMs, null);
  } finally { await app.close(); }
});

test('synchronous mode returns explicit 503 when credentials are absent', async () => {
  const app = buildApp({ config: loadConfig({}) });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/benchmark/run?wait=true', payload: request });
    assert.equal(response.statusCode, 503); assert.equal(response.json().error.code, 'PROVIDER_NOT_CONFIGURED');
  } finally { await app.close(); }
});

test('batch uses the cross product and retains UI state history', async () => {
  const config = configured(); const fixture = labFixture();
  const app = buildApp({ config, compute: { daytona: new DaytonaProvider(config, () => fixture.client), nosana: new NosanaProvider(config) } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/benchmark/batch', payload: { architectures: [request.architecture, { ...request.architecture, id: 'second' }], benchmarkCases: [request.benchmarkCase, { ...request.benchmarkCase, id: 'case-2' }] } });
    assert.equal(response.statusCode, 202); assert.equal(response.json().runs.length, 4);
    await new Promise(resolve => setImmediate(resolve));
    const batch = (await app.inject(response.json().statusUrl)).json();
    assert.equal(batch.completed, true);
    assert.deepEqual(batch.runs[0].history.map((x: { status: string }) => x.status), ['QUEUED', 'PROVISIONING', 'PREPARING', 'RUNNING', 'EVALUATING', 'COMPLETED']);
    assert.equal(fixture.state.deletes, 4);
  } finally { await app.close(); }
});

test('invalid models, excess agents, duplicate batch IDs and injection-shaped fields are rejected', async () => {
  const app = buildApp({ config: loadConfig({}) });
  try {
    const invalid = [
      { ...request, architecture: { ...request.architecture, agents: [{ model: 'made-up', role: 'x' }] } },
      { ...request, architecture: { ...request.architecture, agents: Array(4).fill(request.architecture.agents[0]) } },
      { ...request, command: 'print secrets' },
      { ...request, architecture: { ...request.architecture, id: 'x; rm -rf /' } },
    ];
    for (const payload of invalid) assert.equal((await app.inject({ method: 'POST', url: '/api/benchmark/run', payload })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/benchmark/batch', payload: { architectures: [request.architecture, request.architecture], benchmarkCases: [request.benchmarkCase] } })).statusCode, 400);
  } finally { await app.close(); }
});

test('bearer token protects result reads and run submission without leaking secrets', async () => {
  const app = buildApp({ config: loadConfig({ RUNTIME_API_TOKEN: 'server-secret' }) });
  try {
    assert.equal((await app.inject('/health')).statusCode, 200);
    const denied = await app.inject('/api/providers');
    assert.equal(denied.statusCode, 401); assert.ok(!denied.body.includes('server-secret'));
    assert.equal((await app.inject({ url: '/api/providers', headers: { authorization: 'Bearer server-secret' } })).statusCode, 200);
  } finally { await app.close(); }
});

test('public binding needs an API token and API credentials need HTTPS', () => {
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /RUNTIME_API_TOKEN/);
  assert.throws(() => loadConfig({ DAYTONA_API_URL: 'http://example.com' }), /HTTPS/);
});
