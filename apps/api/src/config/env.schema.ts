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
  /**
   * Optional public client of the Android app (Authorization Code + PKCE, no secret). When
   * set, access tokens issued to it are accepted too (same issuer and audience checks).
   */
  KEYCLOAK_MOBILE_CLIENT_ID: z.string().min(1).optional(),
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
  /**
   * AI provider for the Career Mentor only, independent of AI_PROVIDER (which governs every
   * other AI feature). `none` (default): rule-based mentor answers. `anthropic`: the mentor
   * may ask the model to choose and order its verified suggestions. Uses AI_MODEL and the
   * Anthropic credentials (ANTHROPIC_API_KEY, or the SDK's own credential resolution).
   */
  MENTOR_AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  /**
   * Career Mentor AI allowance per user: at most this many AI-composed answers per
   * MENTOR_AI_USER_WINDOW_SECONDS (counted from ai_usage, so it survives restarts). When used up,
   * the mentor still answers by rules. Only applies when MENTOR_AI_PROVIDER is not none
   * (AI_PROVIDER does not affect the mentor).
   */
  MENTOR_AI_USER_LIMIT: z.coerce.number().int().min(0).default(20),
  MENTOR_AI_USER_WINDOW_SECONDS: z.coerce.number().int().min(60).default(86_400),

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

  /**
   * Adzuna job search API (JOB_SOURCES=adzuna), https://developer.adzuna.com. Credentials come
   * from registering an application with Adzuna; they are secrets and stay in the environment.
   */
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),
  /** Adzuna country code (ISO 3166-1 alpha-2), e.g. in, gb, us. */
  ADZUNA_COUNTRY: z
    .enum([
      'us',
      'sg',
      'es',
      'at',
      'br',
      'in',
      'nz',
      'be',
      'gb',
      'mx',
      'pl',
      'it',
      'ch',
      'de',
      'nl',
      'fr',
      'ca',
      'za',
      'au',
    ])
    .default('in'),
  /** Only ads up to this many days old. */
  ADZUNA_MAX_DAYS_OLD: z.coerce.number().int().min(1).max(90).default(30),
  /** Requests per day this server may make (Adzuna's default allowance is 250/day). */
  ADZUNA_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(200),
  /** Remotive public API (JOB_SOURCES=remotive): feed requests per day; Remotive asks for ≤ 4. */
  REMOTIVE_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).max(4).default(4),
  /**
   * Greenhouse employer job boards to read (JOB_SOURCES=greenhouse): comma-separated board
   * tokens, each optionally "token=Employer name", e.g. "acme,globex=Globex Corp". Public data.
   */
  GREENHOUSE_BOARDS: z.string().default(''),
  /** Lever employer job sites to read (JOB_SOURCES=lever), same format as GREENHOUSE_BOARDS. */
  LEVER_SITES: z.string().default(''),
  /** Lever data centre of the configured sites. */
  LEVER_REGION: z.enum(['global', 'eu']).default('global'),

  /**
   * Smart Apply (ADR-0020). Automatic submission is off unless explicitly enabled AND an
   * authorised submission integration exists (none ships today); preparation and handoff to
   * the official site always work.
   */
  SMART_APPLY_AUTO_SUBMIT_ENABLED: booleanString.default(false),
  /** Background tasks (preparation, submission) run at once across all users. */
  SMART_APPLY_MAX_CONCURRENT: z.coerce.number().int().min(1).max(10).default(2),
  /** Attempts per application for retryable submission failures. */
  SMART_APPLY_MAX_SUBMISSION_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  /** First retry delay; doubled for each further attempt (exponential backoff). */
  SMART_APPLY_RETRY_BASE_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  /** How often due retries and reconciliations are checked. */
  SMART_APPLY_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(30),
  /** Read employers' public application questions (Greenhouse) when preparing. */
  SMART_APPLY_FETCH_EMPLOYER_QUESTIONS: booleanString.default(true),

  RESUME_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(5 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

/** Settings that are acceptable locally but unsafe in a deployed (production) environment. */
const productionSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (env.CORS_ORIGINS.includes('*')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ORIGINS'],
      message: 'must list exact origins in production ("*" is not allowed)',
    });
  }
  if (env.AI_PROVIDER === 'mock') {
    ctx.addIssue({
      code: 'custom',
      path: ['AI_PROVIDER'],
      message: 'the mock provider returns test fixtures and is not allowed in production',
    });
  }
});

export function validateEnv(raw: Record<string, unknown>): Env {
  // Hosts such as Render provide the listening port as PORT; API_PORT wins when both are set.
  const withPort =
    raw.API_PORT === undefined && raw.PORT !== undefined ? { ...raw, API_PORT: raw.PORT } : raw;
  const result = productionSchema.safeParse(withPort);
  if (!result.success) {
    // Only variable names and messages — never values, which may be secrets.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
