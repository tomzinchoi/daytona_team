import type { ModelProfile } from "../shared/types.js";

const rationale = "Illustrative MVP prior, not empirical performance. Scores, speed, and memory depend on the workload, hardware, quantization, and serving setup; replace with calibration data.";

export const MODEL_PROFILES: ModelProfile[] = [
  {
    id: "qwen3-4b", name: "Qwen3 4B", role: "Lightweight general worker",
    prediction: { kind: "PREDICTED", reasoning: 0.70, coding: 0.79, instructionFollowing: 0.82, verification: 0.71, speedTokensPerSecond: 65, memoryMb: 6144, rationale },
  },
  {
    id: "deepseek-r1-distill-qwen-7b", name: "DeepSeek-R1-Distill-Qwen-7B", role: "Reasoning specialist",
    prediction: { kind: "PREDICTED", reasoning: 0.89, coding: 0.78, instructionFollowing: 0.73, verification: 0.78, speedTokensPerSecond: 38, memoryMb: 10240, rationale },
  },
  {
    id: "gemma-3-4b", name: "Gemma 3 4B", role: "Lightweight reviewer / multimodal-capable model (text only in this demo)",
    prediction: { kind: "PREDICTED", reasoning: 0.71, coding: 0.70, instructionFollowing: 0.83, verification: 0.84, speedTokensPerSecond: 60, memoryMb: 6144, rationale },
  },
];
