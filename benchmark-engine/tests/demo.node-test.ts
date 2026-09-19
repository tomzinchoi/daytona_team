import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { calculateQuality, DEMO_WORKLOAD } from "../src/index.js";
import type { CaseEvidence } from "../src/shared/types.js";

const referenceFixes: Record<string, string> = {
  clamp: "module.exports = (value, min, max) => Math.max(min, Math.min(max, value));\n",
  mean: "module.exports = numbers => numbers.length ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length : 0;\n",
  unique: "module.exports = values => [...new Set(values)];\n",
};

test("all three demo bugs fail trusted tests, and reference repairs pass all 12 tests", async () => {
  const originalEvidence: CaseEvidence[] = [], repairedEvidence: CaseEvidence[] = [];
  for (const entry of DEMO_WORKLOAD.cases) {
    const directory = await mkdtemp(join(tmpdir(), "benchmark-engine-fixture-"));
    try {
      for (const [name, content] of Object.entries({ ...entry.files, ...entry.evaluation.files })) await writeFile(join(directory, name), content);
      const childEnvironment = { ...process.env };
      delete childEnvironment.NODE_TEST_CONTEXT;
      for (const repaired of [false, true]) {
        if (repaired) await writeFile(join(directory, "solution.cjs"), referenceFixes[entry.id]!);
        const build = spawnSync(process.execPath, entry.evaluation.buildCommand.args, { cwd: directory, encoding: "utf8", timeout: 10000 });
        assert.equal(build.status, 0, build.stderr);
        const execution = spawnSync(process.execPath, entry.evaluation.testCommand.args, { cwd: directory, encoding: "utf8", timeout: 10000, env: childEnvironment });
        assert.equal(execution.status, repaired ? 0 : 1, execution.stdout + execution.stderr);
        const passed = Number(execution.stdout.match(/^# pass (\d+)\r?$/m)?.[1]);
        const failed = Number(execution.stdout.match(/^# fail (\d+)\r?$/m)?.[1]);
        assert.equal(passed + failed, 4);
        if (repaired) assert.equal(passed, 4); else assert.ok(failed > 0);
        (repaired ? repairedEvidence : originalEvidence).push({ caseId: entry.id, status: "COMPLETED", buildSucceeded: true, tests: { passed, failed, skipped: 0 } });
      }
    } finally {
      // directory is the exact newly-created mkdtemp path, never an input path.
      assert.ok(directory.startsWith(join(tmpdir(), "benchmark-engine-fixture-")));
      await rm(directory, { recursive: true, force: true });
    }
  }
  assert.equal(calculateQuality(DEMO_WORKLOAD, repairedEvidence).score, 1);
  assert.ok(calculateQuality(DEMO_WORKLOAD, originalEvidence).score < 0.5);
});
