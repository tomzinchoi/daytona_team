import test from "node:test";
import assert from "node:assert/strict";
import { architecturesEndpoint, DEMO_WORKLOAD, generateArchitectures, MODEL_PROFILES, screenArchitectures } from "../src/index.js";

test("generates exactly 15 deterministic, unique configurations across A–E", () => {
  const candidates = generateArchitectures(DEMO_WORKLOAD);
  assert.equal(candidates.length, 15);
  assert.equal(new Set(candidates.map((entry) => entry.id)).size, 15);
  assert.deepEqual(generateArchitectures(DEMO_WORKLOAD), candidates);
  for (const family of ["A", "B", "C", "D", "E"]) assert.equal(candidates.filter((entry) => entry.family === family).length, 3);
  assert.equal(new Set(candidates.map((entry) => entry.compute.maxOutputTokensPerAgent)).size, 3);
  assert.deepEqual(new Set(candidates.map((entry) => entry.compute.requestedCpuCores)), new Set([2, 4, 8]));
});

test("single-model candidates include both Qwen and DeepSeek without forced reviewers", () => {
  const singles = generateArchitectures(DEMO_WORKLOAD).filter((entry) => entry.topology.kind === "SINGLE");
  assert.equal(singles.length, 6);
  for (const entry of singles) {
    assert.equal(entry.agents.length, 1); assert.deepEqual(entry.topology.edges, []);
    assert.equal(entry.agents[0]!.role, "IMPLEMENTER"); assert.equal(entry.outputAgentId, entry.agents[0]!.id);
  }
  assert.deepEqual(new Set(singles.map((entry) => entry.agents[0]!.modelId)), new Set(["qwen3-4b", "deepseek-r1-distill-qwen-7b"]));
});

test("multi-agent candidates preserve the required model and role order", () => {
  const candidates = generateArchitectures(DEMO_WORKLOAD);
  const expected = { C: ["deepseek-r1-distill-qwen-7b", "qwen3-4b"], D: ["qwen3-4b", "gemma-3-4b"], E: ["deepseek-r1-distill-qwen-7b", "qwen3-4b", "gemma-3-4b"] };
  for (const [family, models] of Object.entries(expected)) {
    const entry = candidates.find((candidate) => candidate.family === family)!;
    assert.deepEqual(entry.agents.map((agent) => agent.modelId), models);
    assert.equal(entry.topology.kind, "SEQUENTIAL"); assert.equal(entry.topology.edges.length, models.length - 1);
    assert.equal(entry.outputAgentId, entry.agents.at(-1)!.id);
  }
});

test("candidate snapshots do not share mutable compute or agent state", () => {
  const candidates = generateArchitectures(DEMO_WORKLOAD);
  candidates[0]!.compute.maxOutputTokensPerAgent = 1;
  candidates[0]!.agents[0]!.instruction = "changed";
  assert.notEqual(candidates[3]!.compute.maxOutputTokensPerAgent, 1);
  assert.notEqual(generateArchitectures(DEMO_WORKLOAD)[0]!.agents[0]!.instruction, "changed");
});

test("screening returns a ranked Top 3, explicitly PREDICTED at every metric boundary", () => {
  const result = architecturesEndpoint({ workload: DEMO_WORKLOAD });
  assert.equal(result.candidateArchitectures.length, 15); assert.equal(result.screenedArchitectures.length, 3);
  assert.equal(result.screeningKind, "PREDICTED");
  let previous = Infinity;
  for (const entry of result.screenedArchitectures) {
    assert.equal(entry.kind, "PREDICTED"); assert.equal(entry.metrics.kind, "PREDICTED");
    assert.equal(entry.metrics.quality.kind, "PREDICTED"); assert.equal(entry.metrics.resource.kind, "PREDICTED");
    assert.equal(entry.succeeded, null); assert.equal(entry.provider.status, "NOT_CONFIGURED");
    assert.ok(entry.screeningScore <= previous); previous = entry.screeningScore;
    assert.ok(entry.assumptions.length); assert.equal("costUsd" in entry.metrics.resource, false);
  }
  assert.deepEqual(result, architecturesEndpoint({ workload: DEMO_WORKLOAD }));
});

test("screening can favor a single-model architecture and responds to changed priors", () => {
  const candidates = generateArchitectures(DEMO_WORKLOAD);
  const initial = screenArchitectures(DEMO_WORKLOAD, candidates);
  assert.ok(initial.some((entry) => entry.architecture.topology.kind === "SINGLE"));
  const profiles = structuredClone(MODEL_PROFILES);
  const deepseek = profiles.find((entry) => entry.id === "deepseek-r1-distill-qwen-7b")!;
  Object.assign(deepseek.prediction, { coding: 1, reasoning: 1, instructionFollowing: 1, speedTokensPerSecond: 1000, memoryMb: 2048 });
  const reranked = screenArchitectures(DEMO_WORKLOAD, candidates, 3, profiles);
  assert.equal(reranked[0]!.architecture.family, "B");
  assert.notDeepEqual(initial.map((entry) => entry.architecture.id), reranked.map((entry) => entry.architecture.id));
});

test("screening validates limits, profiles, and duplicate candidates", () => {
  const candidates = generateArchitectures(DEMO_WORKLOAD);
  assert.throws(() => screenArchitectures(DEMO_WORKLOAD, candidates, 0), /topK/);
  assert.throws(() => screenArchitectures(DEMO_WORKLOAD, candidates, 3, []), /Missing profile/);
  assert.throws(() => screenArchitectures(DEMO_WORKLOAD, [candidates[0]!, candidates[0]!]), /unique/);
  assert.deepEqual(screenArchitectures(DEMO_WORKLOAD, []), []);
});
