import { z } from 'zod';

const optional = z.preprocess(v => typeof v === 'string' && v.trim() === '' ? undefined : v, z.string().trim().min(1).optional());
const envSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RUNTIME_API_TOKEN: optional,
  DAYTONA_API_KEY: optional,
  DAYTONA_API_URL: z.string().url().default('https://app.daytona.io/api'),
  DAYTONA_TARGET: z.string().default('us'),
  DAYTONA_SNAPSHOT: optional,
  BENCHMARK_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(1800).default(300),
  DAYTONA_PROVISION_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(600).default(120),
  NOSANA_API_KEY: optional,
  NOSANA_MARKET_ID: optional,
  DNSIMPLE_TOKEN: optional,
  DNSIMPLE_ACCOUNT_ID: optional,
  DNSIMPLE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
});
export type Config = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(x => x.path.join('.')).join(', ')}`);
  const config = parsed.data;
  if (!['127.0.0.1', '::1', 'localhost'].includes(config.HOST) && !config.RUNTIME_API_TOKEN) {
    throw new Error('RUNTIME_API_TOKEN is required when HOST is not loopback.');
  }
  if (new URL(config.DAYTONA_API_URL).protocol !== 'https:') throw new Error('DAYTONA_API_URL must use HTTPS.');
  return config;
}
