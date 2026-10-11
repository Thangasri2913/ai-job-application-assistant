import { validateEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5434/db',
  KEYCLOAK_ISSUER_URL: 'http://localhost:8180/realms/ai-job-assistant/',
  KEYCLOAK_CLIENT_ID: 'ai-job-assistant-web',
  KEYCLOAK_AUDIENCE: 'ai-job-assistant-api',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret-value',
};

describe('validateEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = validateEnv({
      ...valid,
      API_PORT: '4000',
      CORS_ORIGINS: 'http://a.test, http://b.test',
      SWAGGER_ENABLED: 'true',
    });
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.AI_PROVIDER).toBe('none');
    expect(env.NODE_ENV).toBe('development');
  });

  it('normalises the Keycloak issuer and requires the client settings', () => {
    expect(validateEnv(valid).KEYCLOAK_ISSUER_URL).toBe(
      'http://localhost:8180/realms/ai-job-assistant',
    );
    const { KEYCLOAK_AUDIENCE: _a, ...missingAudience } = valid;
    expect(() => validateEnv(missingAudience)).toThrow(/KEYCLOAK_AUDIENCE/);
    expect(() => validateEnv({ ...valid, KEYCLOAK_ISSUER_URL: 'not a url' })).toThrow(
      /KEYCLOAK_ISSUER_URL/,
    );
  });

  it('never echoes secret values in errors', () => {
    const secret = 'super-secret-value';
    try {
      validateEnv({ ...valid, S3_SECRET_ACCESS_KEY: 'short', DATABASE_URL: secret });
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = valid;
    expect(() => validateEnv(withoutDatabaseUrl)).toThrow(/DATABASE_URL/);
  });
});
