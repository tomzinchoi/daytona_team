import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createBenchmarkServer, DEMO_WORKLOAD } from "../src/index.js";
import type { ArchitecturesResponse, RecommendResponse } from "../src/shared/types.js";
import { measured } from "./helpers.js";

test("HTTP endpoints support screening and measured recommendations, and return structured errors", async () => {
  const server = createBenchmarkServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const health = await fetch(`${base}/health`); assert.equal(health.status, 200);
    assert.equal((await health.json() as { liveBenchmarkProviderConnected: boolean }).liveBenchmarkProviderConnected, false);
    const demo = await fetch(`${base}/api/demo-workload`); assert.deepEqual(await demo.json(), { workload: DEMO_WORKLOAD });
    const models = await fetch(`${base}/api/model-profiles`); assert.equal((await models.json() as { kind: string }).kind, "PREDICTED");
    const response = await post("/api/architectures", { workload: DEMO_WORKLOAD }); assert.equal(response.status, 200);
    const screening = await response.json() as ArchitecturesResponse;
    assert.equal(screening.candidateArchitectures.length, 15); assert.equal(screening.screenedArchitectures.length, 3);
    const recommendation = await post("/api/recommend", { workload: DEMO_WORKLOAD, results: [measured(0)] });
    assert.equal(recommendation.status, 200); const picks = await recommendation.json() as RecommendResponse;
    assert.ok(picks.performance); assert.ok(picks.balanced); assert.ok(picks.efficient);
    const predictionRejected = await post("/api/recommend", { workload: DEMO_WORKLOAD, results: screening.screenedArchitectures });
    assert.equal(predictionRejected.status, 400);
    for (const body of [null, {}, { workload: DEMO_WORKLOAD }, { workload: null, results: [] }, { workload: DEMO_WORKLOAD, results: [{}] }]) {
      const bad = await post("/api/recommend", body); assert.equal(bad.status, 400, JSON.stringify(body));
      assert.equal((await bad.json() as { error: { code: string } }).error.code, "INVALID_INPUT");
    }
    const invalidJson = await fetch(`${base}/api/architectures`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    assert.equal(invalidJson.status, 400);
    const tooLarge = await post("/api/architectures", { padding: "x".repeat(1024 * 1024) }); assert.equal(tooLarge.status, 413);
    const method = await fetch(`${base}/api/recommend`); assert.equal(method.status, 405);
    const media = await fetch(`${base}/api/architectures`, { method: "POST", body: "{}" }); assert.equal(media.status, 415);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
