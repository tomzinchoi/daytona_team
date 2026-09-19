import type { CaseEvidence, QualityAssessment, Workload } from "../shared/types.js";
import { validateEvidence, validateWorkload } from "./validation.js";

export function calculateQuality(workload: Workload, evidence: CaseEvidence[]): QualityAssessment {
  validateWorkload(workload); validateEvidence(workload, evidence);
  const total = workload.cases.reduce((sum, entry) => sum + entry.evaluation.expectedTests, 0);
  const passed = evidence.reduce((sum, entry) => sum + entry.tests.passed, 0);
  const builds = evidence.filter((entry) => entry.buildSucceeded).length;
  const tasks = evidence.filter((entry) => entry.status === "COMPLETED" && entry.buildSucceeded && entry.tests.failed === 0 && entry.tests.skipped === 0).length;
  const testPassRate = passed / total;
  const buildSuccessRate = builds / evidence.length;
  const taskSuccessRate = tasks / evidence.length;
  const { testWeight, buildWeight, taskWeight } = workload.qualityPolicy;
  const score = Math.min(1, testWeight * testPassRate + buildWeight * buildSuccessRate + taskWeight * taskSuccessRate);
  return {
    kind: "MEASURED", score, testPassRate, buildSuccessRate, taskSuccessRate,
    rationale: [
      `${passed}/${total} trusted tests passed (weight ${testWeight}); skipped or unexecuted tests earn no credit.`,
      `${builds}/${evidence.length} syntax/build checks passed (weight ${buildWeight}).`,
      `${tasks}/${evidence.length} tasks completed with all tests and build passing (weight ${taskWeight}).`,
      "Quality uses objective execution evidence; no LLM-as-a-judge score.",
    ],
    evidence: structuredClone(evidence),
  };
}
