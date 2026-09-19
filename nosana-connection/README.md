# Nosana connection — server only

This isolated integration does not change the concurrently edited engine, frontend, or runtime source. Requires Node.js 22+; no packages to install.

The supplied credential is in the ignored `nosana-connection/.env` and `runtime-infra/.env` files. Never copy it into VITE_ variables or a browser request. Existing runtime environment variables were preserved. A running runtime process must restart before it sees changed environment values.

From the repository root:

```sh
node nosana-connection/check.mjs
node nosana-connection/check.mjs --smoke
```

The first command authenticates and lists current models. The second also performs one short, billable, real GPU inference request and prints output, token usage, and measured request latency. These are connection checks, not workload benchmark scores.

```ts
import { createNosanaClient } from './nosana-connection/client.mjs';
const nosana = await createNosanaClient();
const models = await nosana.listModels();
// Select a chat model from the current list, not an embedding model.
const model = models.data.find(m => /qwen/i.test(m.id) && !/embed/i.test(m.id) && m.available !== false);
if (!model) throw new Error('No available Qwen chat model');
const result = await nosana.chat({
  model: model.id,
  messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
  max_tokens: 128,
});
console.log(result.choices[0].message.content);
```

Use the TypeScript declarations in `client.d.mts` from backend code. Authentication is Bearer; base URL is `https://inference.nosana.com/v1`. Requests have a bounded timeout; errors omit upstream bodies and credentials. There are no automatic paid retries.

At initial connection, the live catalog offered `qwen/qwen3.8-27b` (chat) and `nvidia/nemotron-3-embed-1b` (embedding). Availability changes. Do not silently map this chat model to the engine's `qwen3-4b`, DeepSeek, or Gemma identifiers: they are different models. Do not describe Nosana inference as a controlled Daytona benchmark.

Frontend provider indicators must use actual backend health responses; the demo fixture stays a demo. Setting this key alone does not enable the runtime's custom GPU job adapter or provision dedicated models.

Official reference: https://learn.nosana.com/api/llm.html
