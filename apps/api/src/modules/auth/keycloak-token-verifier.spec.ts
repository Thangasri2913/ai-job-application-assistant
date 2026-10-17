import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { AppConfigService } from '../../config/config.module.js';
import { KeycloakTokenVerifier, TokenVerificationError } from './keycloak-token-verifier.js';

const ISSUER = 'http://localhost:8180/realms/ai-job-assistant';
const config = {
  get: (key: string) =>
    ({
      KEYCLOAK_ISSUER_URL: ISSUER,
      KEYCLOAK_AUDIENCE: 'ai-job-assistant-api',
      KEYCLOAK_CLIENT_ID: 'ai-job-assistant-web',
    })[key],
} as unknown as AppConfigService;

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }],
  });
  const sign = (claims: Record<string, unknown>) =>
    new SignJWT({
      iss: ISSUER,
      aud: 'ai-job-assistant-api',
      azp: 'ai-job-assistant-web',
      typ: 'Bearer',
      sub: 'kc-subject',
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  return { verifier: new KeycloakTokenVerifier(config, () => Promise.resolve(jwks)), sign };
}

describe('KeycloakTokenVerifier', () => {
  it('maps validated claims to the application identity', async () => {
    const { verifier, sign } = await setup();
    const claims = await verifier.verify(
      await sign({
        email: ' Priya@Example.com ',
        email_verified: true,
        name: 'Priya',
        realm_access: { roles: ['user', 7] },
        auth_time: 1700000000,
      }),
    );
    expect(claims).toEqual({
      subject: 'kc-subject',
      email: 'priya@example.com',
      emailVerified: true,
      name: 'Priya',
      roles: ['user'],
      authTime: 1700000000,
    });
  });

  it('reports "unavailable" when Keycloak keys cannot be fetched', async () => {
    const { sign } = await setup();
    const verifier = new KeycloakTokenVerifier(config, () =>
      Promise.reject(new Error('ECONNREFUSED')),
    );
    await expect(verifier.verify(await sign({}))).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('rejects tokens missing the subject', async () => {
    const { verifier, sign } = await setup();
    const error = await verifier.verify(await sign({ sub: undefined })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TokenVerificationError);
    expect((error as TokenVerificationError).reason).toBe('invalid');
  });

  it('accepts the configured mobile client and nothing else', async () => {
    const { verifier: webOnly, sign } = await setup();
    const withMobile = {
      get: (key: string) =>
        key === 'KEYCLOAK_MOBILE_CLIENT_ID' ? 'ai-job-assistant-mobile' : config.get(key as never),
    } as unknown as AppConfigService;
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }],
    });
    const verifier = new KeycloakTokenVerifier(withMobile, () => Promise.resolve(jwks));
    const token = (azp: string) =>
      new SignJWT({
        iss: ISSUER,
        aud: 'ai-job-assistant-api',
        azp,
        typ: 'Bearer',
        sub: 'kc-subject',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    await expect(verifier.verify(await token('ai-job-assistant-mobile'))).resolves.toMatchObject({
      subject: 'kc-subject',
    });
    await expect(verifier.verify(await token('ai-job-assistant-web'))).resolves.toBeDefined();
    await expect(verifier.verify(await token('other-client'))).rejects.toThrow(
      TokenVerificationError,
    );
    // Without the setting, mobile tokens are refused.
    await expect(webOnly.verify(await sign({ azp: 'ai-job-assistant-mobile' }))).rejects.toThrow(
      TokenVerificationError,
    );
  });
});
