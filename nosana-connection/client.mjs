// Server-only, dependency-free Nosana inference client. Never import into a browser bundle.
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export const NOSANA_BASE_URL = 'https://inference.nosana.com/v1';

export async function createNosanaClient({ apiKey, timeoutMs = 60000 } = {}) {
  if (!apiKey) {
    const local = await readFile(new URL('.env', import.meta.url), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    apiKey = process.env.NOSANA_API_KEY || parseEnv(local).NOSANA_API_KEY;
  }
  if (!apiKey || !apiKey.startsWith('nos_')) throw new Error('NOSANA_API_KEY is missing or malformed. Set it on the server.');
  async function request(path, body) {
    const response = await fetch(`${NOSANA_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) {
      // Do not include upstream response bodies or request headers in errors.
      const error = new Error(`Nosana request failed (HTTP ${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  return {
    listModels: () => request('/models'),
    async chat({ model, messages, max_tokens = 512, temperature = 0 }) {
      if (!model || !Array.isArray(messages) || !messages.length) throw new Error('A served model ID and messages are required.');
      if (!Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > 4096) throw new Error('max_tokens must be between 1 and 4096.');
      return request('/chat/completions', { model, messages, max_tokens, temperature, stream: false });
    },
  };
}
