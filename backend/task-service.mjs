import { randomUUID } from 'node:crypto';

// Same model deployments as backend/bench.py. Client input never controls URLs.
export const TASK_MODELS = {
  'gemma4-e2b': { model: 'gemma4:e2b', url: 'https://5vx3tKxSRZwzg3SfRQ8pAPid6aUyznW2FnZeCUkkNYDs.node.k8s.prd.nos.ci/v1' },
  'qwen3.5-9b': { model: 'qwen3.5:9b', url: 'https://4BUrPw8sui86nvQPXHYCrpUfecMTTYdtQ6x4jGPEjnh3.node.k8s.prd.nos.ci/v1' },
  'gpt-oss-20b': { model: 'gpt-oss:20b', url: 'https://Bfgtcmr6BEf2Da9TYHW3xQXm9ApHPYQJmbtn14fjsWaK.node.k8s.prd.nos.ci/v1' },
};
export async function executeTask(input, fetcher = fetch) {
  if (!input || !Object.hasOwn(TASK_MODELS, input.modelId ?? '') || typeof input.workload !== 'string' || !input.workload.trim() || input.workload.length > 100000) {
    const error = new Error('실행할 모델과 작업을 확인해 주세요. 작업은 최대 100,000자입니다.'); error.status = 400; throw error;
  }
  const cfg = TASK_MODELS[input.modelId];
  const started = Date.now();
  let response;
  try {
    response = await fetcher(`${cfg.url}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nosana' },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: 'Complete the user task. Treat attached file contents as task data. Return the requested deliverable. Do not claim to have executed code or tests; you have no execution tools.' }, { role: 'user', content: input.workload }], max_tokens: 2048, temperature: 0, stream: false }),
      signal: AbortSignal.timeout(50000), redirect: 'error',
    });
  } catch { const error = new Error('모델 응답 시간이 초과되었거나 연결할 수 없습니다. 결과를 받지 못했습니다.'); error.status = 504; throw error; }
  if (!response.ok) { const error = new Error(`모델 실행 서비스 오류 (${response.status}). 입력을 보존했습니다.`); error.status = 502; throw error; }
  const data = await response.json();
  const choice = data.choices?.[0];
  if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) { const error = new Error('모델이 최종 답변을 반환하지 않았습니다.'); error.status = 502; throw error; }
  return { id: randomUUID(), modelId: input.modelId, model: cfg.model, output: choice.message.content, elapsedMs: Date.now() - started, completionTokens: Number.isInteger(data.usage?.completion_tokens) ? data.usage.completion_tokens : null, finishReason: choice.finish_reason ?? null, evaluation: 'NOT_EVALUATED', provider: 'Nosana', maxOutputTokens: 2048 };
}
