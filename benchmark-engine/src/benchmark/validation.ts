import type { Architecture, CaseEvidence, ProviderStatus, ResourceUsage, Workload } from "../shared/types.js";

export class InputError extends Error {
  constructor(message: string) { super(message); this.name = "InputError"; }
}

export function requireInput(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InputError(message);
}
export function record(value: unknown, name: string): asserts value is Record<string, unknown> {
  requireInput(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
}
export function nonempty(value: unknown, name: string): asserts value is string {
  requireInput(typeof value === "string" && value.trim().length > 0, `${name} must be a nonempty string`);
}
export function numberIn(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  requireInput(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max, `${name} must be a finite number in [${min}, ${max}]`);
}
export function integer(value: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  numberIn(value, name, min, max);
  requireInput(Number.isSafeInteger(value), `${name} must be an integer`);
}
function stringList(value: unknown, name: string): asserts value is string[] {
  requireInput(Array.isArray(value), `${name} must be an array`);
  value.forEach((item) => nonempty(item, name));
}
function relativePath(value: string): void {
  requireInput(/^[a-zA-Z0-9_.\/-]+$/.test(value) && !value.startsWith("/") && value.split("/").every((part) => part !== ".." && part !== "." && part !== ""), "File paths must be safe relative paths");
}
function fileMap(value: unknown, name: string): asserts value is Record<string, string> {
  record(value, name);
  requireInput(Object.keys(value).length > 0, `${name} must contain files`);
  for (const [path, content] of Object.entries(value)) {
    relativePath(path);
    requireInput(typeof content === "string", `${name}.${path} must be a string`);
  }
}

export function validateWorkload(value: unknown): asserts value is Workload {
  record(value, "workload");
  for (const key of ["id", "version", "name", "description"]) nonempty(value[key], `workload.${key}`);
  requireInput(value.kind === "CODING", "Only CODING workloads are supported in this MVP");
  record(value.qualityPolicy, "qualityPolicy");
  const policy = value.qualityPolicy;
  for (const key of ["testWeight", "buildWeight", "taskWeight", "acceptableQuality"]) numberIn(policy[key], key, 0, 1);
  requireInput(Math.abs((policy.testWeight as number) + (policy.buildWeight as number) + (policy.taskWeight as number) - 1) < 1e-9, "Quality weights must sum to 1");
  requireInput(Array.isArray(value.cases) && value.cases.length > 0 && value.cases.length <= 100, "workload.cases must contain 1–100 cases");
  const ids = new Set<string>();
  for (const entry of value.cases) {
    record(entry, "case");
    nonempty(entry.id, "case.id");
    requireInput(!ids.has(entry.id), "Case IDs must be unique"); ids.add(entry.id);
    nonempty(entry.title, "case.title"); nonempty(entry.instruction, "case.instruction");
    fileMap(entry.files, "case.files"); stringList(entry.editableFiles, "case.editableFiles");
    requireInput(entry.editableFiles.length > 0 && new Set(entry.editableFiles).size === entry.editableFiles.length, "editableFiles must be nonempty and unique");
    for (const path of entry.editableFiles) requireInput(Object.hasOwn(entry.files, path), "Editable files must exist in case.files");
    record(entry.evaluation, "case.evaluation"); fileMap(entry.evaluation.files, "evaluation.files");
    for (const path of Object.keys(entry.evaluation.files)) requireInput(!Object.hasOwn(entry.files, path), "Trusted evaluation files must not overlap model-supplied files");
    integer(entry.evaluation.expectedTests, "expectedTests", 1, 10000);
    for (const key of ["buildCommand", "testCommand"]) {
      const command = entry.evaluation[key]; record(command, key);
      requireInput(command.executable === "node", "Evaluation commands must use node");
      stringList(command.args, `${key}.args`); requireInput(command.args.length > 0, "Evaluation commands require arguments");
    }
  }
}

export function validateArchitecture(value: unknown): asserts value is Architecture {
  record(value, "architecture"); nonempty(value.id, "architecture.id"); nonempty(value.name, "architecture.name");
  requireInput(["A", "B", "C", "D", "E"].includes(value.family as string), "Unknown architecture family");
  requireInput(Array.isArray(value.agents) && value.agents.length >= 1 && value.agents.length <= 3, "Architecture requires 1–3 agents");
  const ids: string[] = [];
  for (const agent of value.agents) {
    record(agent, "agent"); nonempty(agent.id, "agent.id"); nonempty(agent.instruction, "agent.instruction");
    requireInput(["qwen3-4b", "deepseek-r1-distill-qwen-7b", "gemma-3-4b"].includes(agent.modelId as string), "Unsupported modelId");
    requireInput(["PLANNER", "IMPLEMENTER", "REVIEWER"].includes(agent.role as string), "Unsupported agent role");
    ids.push(agent.id);
  }
  requireInput(new Set(ids).size === ids.length, "Agent IDs must be unique");
  record(value.topology, "topology");
  requireInput(value.topology.kind === (ids.length === 1 ? "SINGLE" : "SEQUENTIAL"), "Topology must match agent count");
  requireInput(Array.isArray(value.topology.edges) && value.topology.edges.length === ids.length - 1, "Topology must connect consecutive agents");
  value.topology.edges.forEach((edge: unknown, index: number) => {
    record(edge, "edge"); requireInput(edge.from === ids[index] && edge.to === ids[index + 1], "Topology must connect consecutive agents in execution order");
  });
  requireInput(value.outputAgentId === ids[ids.length - 1], "outputAgentId must be the last agent");
  record(value.compute, "compute");
  requireInput(["compact", "standard", "extended"].includes(value.compute.id as string), "Unknown compute configuration");
  integer(value.compute.requestedCpuCores, "requestedCpuCores", 1, 64);
  integer(value.compute.requestedMemoryMb, "requestedMemoryMb", 1024, 262144);
  requireInput(value.compute.accelerator === "CPU_ONLY", "MVP compute configurations request CPU_ONLY execution");
  integer(value.compute.maxOutputTokensPerAgent, "maxOutputTokensPerAgent", 1, 65536);
  integer(value.compute.timeoutMsPerCase, "timeoutMsPerCase", 1, 600000);
  requireInput(value.compute.maxConcurrentCases === 1 && value.compute.modelHosting === "PROVIDER_MANAGED", "MVP requires sequential cases and provider-managed model hosting");
}

export function validateProvider(value: unknown): asserts value is ProviderStatus {
  record(value, "provider");
  for (const key of ["id", "name", "detail"]) nonempty(value[key], `provider.${key}`);
  requireInput(["READY", "UNAVAILABLE", "NOT_CONFIGURED"].includes(value.status as string), "Invalid provider status");
  requireInput(["DAYTONA", "LOCAL", "OTHER"].includes(value.executionEnvironment as string), "Invalid execution environment");
}

export function validateResources(value: unknown): asserts value is ResourceUsage {
  record(value, "resource"); nonempty(value.measurementContext, "resource.measurementContext");
  for (const key of ["costUsd", "computeTimeMs", "peakMemoryMb"]) if (value[key] !== null) numberIn(value[key], `resource.${key}`);
  if (value.computeTimeBasis !== null) nonempty(value.computeTimeBasis, "computeTimeBasis");
  if (value.computeTimeMs !== null) nonempty(value.computeTimeBasis, "computeTimeBasis is required when computeTimeMs is measured");
}

export function validateEvidence(workload: Workload, evidence: unknown): asserts evidence is CaseEvidence[] {
  requireInput(Array.isArray(evidence) && evidence.length === workload.cases.length, "Evidence must cover every workload case exactly once");
  const seen = new Set<string>();
  for (const item of evidence) {
    record(item, "case evidence"); nonempty(item.caseId, "caseId");
    const expected = workload.cases.find((entry) => entry.id === item.caseId);
    requireInput(expected && !seen.has(item.caseId), "Evidence case IDs must match the workload, without duplicates"); seen.add(item.caseId);
    requireInput(["COMPLETED", "TIMEOUT", "ERROR"].includes(item.status as string), "Invalid case status");
    requireInput(typeof item.buildSucceeded === "boolean", "buildSucceeded must be boolean");
    record(item.tests, "tests");
    integer(item.tests.passed, "tests.passed"); integer(item.tests.failed, "tests.failed"); integer(item.tests.skipped, "tests.skipped");
    requireInput(item.tests.passed + item.tests.failed + item.tests.skipped === expected.evaluation.expectedTests, "Test counts must equal expectedTests; unexecuted tests count as skipped");
  }
}
