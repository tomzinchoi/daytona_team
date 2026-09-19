export interface NosanaModel { id: string; available?: boolean; pricing?: { prompt: string; completion: string }; }
export interface NosanaMessage { role: 'system' | 'user' | 'assistant'; content: string; }
export interface NosanaCompletion {
  id: string;
  model: string;
  choices: { index: number; message: { role: string; content: string | null; reasoning?: string }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
export const NOSANA_BASE_URL: string;
export function createNosanaClient(options?: { apiKey?: string; timeoutMs?: number }): Promise<{
  listModels(): Promise<{ object: string; data: NosanaModel[] }>;
  chat(options: { model: string; messages: NosanaMessage[]; max_tokens?: number; temperature?: number }): Promise<NosanaCompletion>;
}>;
