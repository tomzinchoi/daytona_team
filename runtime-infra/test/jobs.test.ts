import assert from 'node:assert/strict';
import test from 'node:test';
import { BenchmarkJobs } from '../src/jobs.js';
import { loadConfig } from '../src/config.js';
import { NosanaProvider } from '../src/providers/nosana.js';
import { DaytonaProvider } from '../src/providers/daytona.js';
import { configured, labFixture, request } from './fixtures.js';

test('queue enforces a finite capacity atomically for a batch', async () => {
  const config = loadConfig({});
  const jobs = new BenchmarkJobs({ daytona: new DaytonaProvider(config), nosana: new NosanaProvider(config) }, 300, 2);
  const runs = jobs.submit([request, request]);
  assert.throws(() => jobs.submit([request]), /queue is full/);
  await Promise.all(runs.map(run => jobs.wait(run.id)));
  assert.equal(jobs.submit([request, request]).length, 2);
  await jobs.close();
});

test('jobs run serially and do not overlap sandbox lifecycles', async () => {
  const fixture = labFixture(); const config = configured(); const order: string[] = [];
  const create = fixture.client.create.bind(fixture.client); const remove = fixture.sandbox.delete.bind(fixture.sandbox);
  fixture.client.create = async (...args) => { order.push('create'); return create(...args); };
  fixture.sandbox.delete = async (...args) => { order.push('delete'); return remove(...args); };
  const jobs = new BenchmarkJobs({ daytona: new DaytonaProvider(config, () => fixture.client), nosana: new NosanaProvider(config) }, 300);
  const runs = jobs.submit([request, request]);
  await Promise.all(runs.map(run => jobs.wait(run.id)));
  assert.deepEqual(order, ['create', 'delete', 'create', 'delete']);
  await jobs.close();
});

test('enqueue from a just-completed job cannot strand the next job', { timeout: 2000 }, async () => {
  const config = loadConfig({});
  const jobs = new BenchmarkJobs({ daytona: new DaytonaProvider(config), nosana: new NosanaProvider(config) }, 300);
  const first = jobs.submit([request])[0]!;
  const next = await jobs.wait(first.id).then(() => jobs.submit([request])[0]!);
  assert.equal((await jobs.wait(next.id)).status, 'FAILED');
  await jobs.close();
});
