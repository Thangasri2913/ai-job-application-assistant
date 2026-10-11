import { randomUUID } from 'node:crypto';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';

/**
 * Stands in for Keycloak's signing keys in integration tests. Tokens are real, signed
 * JWTs verified by the production verifier — only the key source differs. Nothing here
 * weakens validation: wrong keys, issuers, audiences or expiry are still rejected.
 */
const keyPair = generateKeyPair('RS256', { extractable: true });
let jwks: Promise<JWTVerifyGetKey> | null = null;

export function testKeyResolver(): Promise<JWTVerifyGetKey> {
  jwks ??= keyPair.then(async ({ publicKey }) => {
    const jwk = await exportJWK(publicKey);
    return createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
  });
  return jwks;
}

export interface TestIdentity {
  sub: string;
  email: string;
  name: string;
  emailVerified?: boolean;
}

export function newIdentity(name = 'Test User'): TestIdentity {
  const id = randomUUID();
  return { sub: id, email: `user-${id.slice(0, 8)}@example.com`, name };
}

/** Issues a Keycloak-shaped access token. `overrides` can break any claim for negative tests. */
export async function issueToken(
  identity: TestIdentity,
  overrides: JWTPayload & { exp?: number } = {},
  options: { signWith?: CryptoKey } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const { privateKey } = await keyPair;
  const claims: JWTPayload = {
    iss: process.env.KEYCLOAK_ISSUER_URL,
    aud: [process.env.KEYCLOAK_AUDIENCE!, 'account'],
    azp: process.env.KEYCLOAK_CLIENT_ID,
    typ: 'Bearer',
    sub: identity.sub,
    email: identity.email,
    email_verified: identity.emailVerified ?? false,
    name: identity.name,
    preferred_username: identity.email,
    realm_access: { roles: ['user', 'default-roles-ai-job-assistant'] },
    auth_time: now,
    iat: now,
    exp: now + 300,
    ...overrides,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .sign(options.signWith ?? privateKey);
}
