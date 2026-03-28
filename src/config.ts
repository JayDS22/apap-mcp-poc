import { z } from 'zod';

// Fail-fast env validation. Learned this the hard way at Bridgestone -- a missing
// DB password that didn't surface until the first query hit 30 seconds into startup.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(9000),

  // Postgres connection
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_USER: z.string().default('postgres'),
  POSTGRES_PASSWORD: z.string().default('1baddeed'),
  POSTGRES_DATABASE: z.string().default('postgres'),
  POSTGRES_URL: z.string().optional(),

  // Optional auth header for the REST API
  APAP_API_AUTH_HEADER: z.string().optional(),

  // Log level (pino-compatible)
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

/** Parse + validate env vars. Cached after first call. Throws ZodError if anything's wrong. */
export function getConfig(): EnvConfig {
  if (_config) return _config;
  _config = envSchema.parse(process.env);
  return _config;
}

/** Build a Postgres connection string, or use POSTGRES_URL if the caller set one. */
export function getDatabaseUrl(config?: EnvConfig): string {
  const c = config ?? getConfig();
  if (c.POSTGRES_URL) return c.POSTGRES_URL;
  return `postgresql://${c.POSTGRES_USER}:${c.POSTGRES_PASSWORD}@${c.POSTGRES_HOST}:${c.POSTGRES_PORT}/${c.POSTGRES_DATABASE}`;
}
