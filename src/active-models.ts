// Models actually configured by the team in backend/bench.py.
export const ACTIVE_MODEL_IDS = ['gemma4-e2b', 'qwen3.5-9b', 'gpt-oss-20b'] as const;
export const ACTIVE_MODELS = [
  { id: 'gemma4-e2b', name: 'Gemma 4 E2B', model: 'gemma4:e2b' },
  { id: 'qwen3.5-9b', name: 'Qwen 3.5 9B', model: 'qwen3.5:9b' },
  { id: 'gpt-oss-20b', name: 'GPT-OSS 20B', model: 'gpt-oss:20b' },
] as const;
export function isActiveModel(name: string): boolean {
  return ACTIVE_MODELS.some(m => m.id === name || m.name === name || m.model === name);
}
