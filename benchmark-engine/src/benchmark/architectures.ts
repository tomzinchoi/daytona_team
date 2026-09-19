import type { AgentSpec, Architecture, ComputeConfig, ModelId, Workload } from "../shared/types.js";
import { validateWorkload } from "./validation.js";

const COMPUTE_CONFIGS: ComputeConfig[] = [
  { id: "compact", requestedCpuCores: 2, requestedMemoryMb: 12288, accelerator: "CPU_ONLY", maxOutputTokensPerAgent: 384, timeoutMsPerCase: 20000, maxConcurrentCases: 1, modelHosting: "PROVIDER_MANAGED" },
  { id: "standard", requestedCpuCores: 4, requestedMemoryMb: 16384, accelerator: "CPU_ONLY", maxOutputTokensPerAgent: 768, timeoutMsPerCase: 40000, maxConcurrentCases: 1, modelHosting: "PROVIDER_MANAGED" },
  { id: "extended", requestedCpuCores: 8, requestedMemoryMb: 16384, accelerator: "CPU_ONLY", maxOutputTokensPerAgent: 1536, timeoutMsPerCase: 80000, maxConcurrentCases: 1, modelHosting: "PROVIDER_MANAGED" },
];

const ROLE_INSTRUCTIONS: Record<AgentSpec["role"], string> = {
  PLANNER: "Inspect the bug and provide a brief repair plan for the implementer. Do not claim tests were run.",
  IMPLEMENTER: "Use the case and any preceding plan to return the complete corrected editable file. Do not modify evaluation files.",
  REVIEWER: "Review the preceding implementation against the case. Return the complete corrected editable file, even if no changes are needed. Do not modify evaluation files.",
};

const FAMILIES: { family: Architecture["family"]; name: string; stages: [ModelId, AgentSpec["role"]][] }[] = [
  { family: "A", name: "Qwen only", stages: [["qwen3-4b", "IMPLEMENTER"]] },
  { family: "B", name: "DeepSeek only", stages: [["deepseek-r1-distill-qwen-7b", "IMPLEMENTER"]] },
  { family: "C", name: "DeepSeek → Qwen", stages: [["deepseek-r1-distill-qwen-7b", "PLANNER"], ["qwen3-4b", "IMPLEMENTER"]] },
  { family: "D", name: "Qwen → Gemma", stages: [["qwen3-4b", "IMPLEMENTER"], ["gemma-3-4b", "REVIEWER"]] },
  { family: "E", name: "DeepSeek → Qwen → Gemma", stages: [["deepseek-r1-distill-qwen-7b", "PLANNER"], ["qwen3-4b", "IMPLEMENTER"], ["gemma-3-4b", "REVIEWER"]] },
];

export function generateArchitectures(workload: Workload): Architecture[] {
  validateWorkload(workload);
  return FAMILIES.flatMap(({ family, name, stages }) => COMPUTE_CONFIGS.map((compute) => {
    const agents = stages.map(([modelId, role], i): AgentSpec => ({ id: `agent-${i + 1}`, modelId, role, instruction: ROLE_INSTRUCTIONS[role] }));
    return {
      id: `${family.toLowerCase()}-${compute.id}`, family, name: `${name} / ${compute.id}`,
      agents, outputAgentId: agents[agents.length - 1]!.id,
      topology: { kind: agents.length === 1 ? "SINGLE" : "SEQUENTIAL", edges: agents.slice(1).map((agent, i) => ({ from: agents[i]!.id, to: agent.id })) },
      compute: { ...compute },
    };
  }));
}
