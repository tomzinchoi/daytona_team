import { createNosanaClient } from './client.mjs';

try {
  const client = await createNosanaClient();
  const models = await client.listModels();
  console.log(JSON.stringify({ provider: 'nosana', authenticated: true, availableModels: models.data.map(m => ({ id: m.id, available: m.available, pricing: m.pricing })) }, null, 2));
  if (process.argv.includes('--smoke')) {
    const model = models.data.find(m => m.available !== false && /qwen/i.test(m.id) && !/embed/i.test(m.id));
    if (!model) throw new Error('No currently served Qwen chat model. Choose a chat model from listModels().');
    const started = performance.now();
    const result = await client.chat({ model: model.id, messages: [{ role: 'user', content: 'Reply with exactly OK. Do not explain.' }], max_tokens: 128 });
    const content = result.choices?.[0]?.message?.content;
    console.log(JSON.stringify({ provider: 'nosana', source: 'live', model: result.model, response: content, finishReason: result.choices?.[0]?.finish_reason, latencyMs: Math.round(performance.now() - started), usage: result.usage }, null, 2));
    if (!content?.trim()) throw new Error('The inference request returned no answer content.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
