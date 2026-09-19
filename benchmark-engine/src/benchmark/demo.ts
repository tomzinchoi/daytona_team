import type { BenchmarkCase, Workload } from "../shared/types.js";

function codingCase(id: string, title: string, instruction: string, source: string, tests: string): BenchmarkCase {
  return {
    id, title, instruction,
    files: { "solution.cjs": source },
    editableFiles: ["solution.cjs"],
    evaluation: {
      files: { "solution.test.cjs": `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst solve = require('./solution.cjs');\n${tests}` },
      buildCommand: { executable: "node", args: ["--check", "solution.cjs"] },
      testCommand: { executable: "node", args: ["--test", "--test-reporter=tap", "solution.test.cjs"] },
      expectedTests: 4,
    },
  };
}

export const DEMO_WORKLOAD: Workload = {
  id: "tiny-js-bugfix", version: "1.0.0", name: "Recurring JavaScript bug fixes", kind: "CODING",
  description: "Fix one small CommonJS function per case. Preserve its export and make the trusted tests pass. No dependencies, network, or LLM judge.",
  qualityPolicy: { testWeight: 0.8, buildWeight: 0.1, taskWeight: 0.1, acceptableQuality: 0.8 },
  cases: [
    codingCase("clamp", "Clamp to inclusive bounds",
      "Export clamp(value, min, max). Return min below range, max above range, otherwise value. min <= max; inputs are finite numbers. Return the complete corrected solution.cjs.",
      "module.exports = function clamp(value, min, max) { return Math.min(min, Math.max(max, value)); };\n",
      `test('below range', () => assert.equal(solve(-5, 0, 10), 0));
test('above range', () => assert.equal(solve(15, 0, 10), 10));
test('inside range', () => assert.equal(solve(4, 0, 10), 4));
test('equal bounds', () => assert.equal(solve(9, 3, 3), 3));\n`),
    codingCase("mean", "Calculate an arithmetic mean",
      "Export mean(numbers). Return the arithmetic mean of finite numbers, or 0 for an empty array. Do not mutate the array. Return the complete corrected solution.cjs.",
      "module.exports = function mean(numbers) { return numbers.reduce((sum, n) => sum + n, 0) / (numbers.length + 1); };\n",
      `test('empty array', () => assert.equal(solve([]), 0));
test('single item', () => assert.equal(solve([8]), 8));
test('negative values', () => assert.equal(solve([-4, -2]), -3));
test('mean and no mutation', () => { const a = [2, 4, 9]; assert.equal(solve(a), 5); assert.deepEqual(a, [2, 4, 9]); });\n`),
    codingCase("unique", "Deduplicate while preserving order",
      "Export unique(values). Remove duplicate strings/numbers, preserving first-occurrence order and without mutating the input. Strings and numbers are distinct. Return the complete corrected solution.cjs.",
      "module.exports = function unique(values) { return values.filter((value, index) => values.lastIndexOf(value) === index); };\n",
      `test('empty array', () => assert.deepEqual(solve([]), []));
test('first occurrence order', () => assert.deepEqual(solve(['b', 'a', 'b', 'c', 'a']), ['b', 'a', 'c']));
test('type distinction', () => assert.deepEqual(solve([1, '1', 1, '1']), [1, '1']));
test('no mutation', () => { const a = [2, 1, 2]; assert.deepEqual(solve(a), [2, 1]); assert.deepEqual(a, [2, 1, 2]); });\n`),
  ],
};
