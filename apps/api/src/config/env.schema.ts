import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * Every environment variable the API reads. Validated once at startup:
 * the process refuses to boot with missing or malformed configuration.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SWAGGER_ENABLED: booleanString.default(false),
  /** Number of reverse-proxy hops to trust for client IP (rate limiting). 0 = none. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /** Realm issuer, exactly as it appears in tokens (`iss`). */
  KEYCLOAK_ISSUER_URL: z.url().transform((v) => v.replace(/\/+$/, '')),
  /** Client id of the web app; tokens must have been issued to it (`azp`). */
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  /** Audience this API requires in access tokens (`aud`). */
  KEYCLOAK_AUDIENCE: z.string().min(1),

  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  /** Uploads per RATE_LIMIT_TTL_SECONDS window, per client. */
  UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  JOB_ANALYSIS_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),

  AI_PROVIDER: z.enum(['none', 'mock', 'anthropic']).default('none'),
  /** Model used by the anthropic provider. */
  AI_MODEL: z.string().min(1).default('claude-opus-5'),
  /** Optional: the Anthropic SDK also resolves credentials from its own environment/profile. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: booleanString.default(false),
  S3_AUTO_CREATE_BUCKET: booleanString.default(false),

  /**
   * Comma-separated job source keys to enable (ADR-0018). "dev" = development fixtures,
   * refused in production. Empty: no discovery sources (runs fail gracefully).
   */
  JOB_SOURCES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((key) => key.trim().toLowerCase())
        .filter(Boolean),
    ),
  /** Runs due job alerts in-process. Disabled in tests, which call the scheduler directly. */
  JOB_ALERT_SCHEDULER_ENABLED: booleanString.default(true),
  JOB_ALERT_SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(10).default(60),

  RESUME_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(5 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Only variable names and messages — never values, which may be secrets.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
