import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createRemoteJWKSet,
  errors as joseErrors,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import { AppConfigService } from '../../config/config.module.js';
import type { IdentityClaims } from './identity-claims.js';

/** Resolves the key that signed a token. Remote JWKS in production; local keys in tests. */
export const KEYCLOAK_KEY_RESOLVER = Symbol('KEYCLOAK_KEY_RESOLVER');

export type TokenFailure = 'invalid' | 'expired' | 'unavailable';

export class TokenVerificationError extends Error {
  constructor(readonly reason: TokenFailure) {
    super(`Token verification failed: ${reason}`);
    this.name = 'TokenVerificationError';
  }
}

interface KeycloakAccessTokenPayload extends JWTPayload {
  typ?: string;
  azp?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  auth_time?: number;
  realm_access?: { roles?: unknown };
}

const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'ES256'];

/**
 * Lazily discovers the realm's JWKS endpoint via OIDC discovery and caches the
 * resolver (jose caches and rotates keys itself).
 */
@Injectable()
export class KeycloakJwksResolver {
  private readonly logger = new Logger(KeycloakJwksResolver.name);
  private resolver: Promise<JWTVerifyGetKey> | null = null;

  constructor(private readonly config: AppConfigService) {}

  get(): Promise<JWTVerifyGetKey> {
    this.resolver ??= this.discover().catch((error: unknown) => {
      this.resolver = null; // retry discovery on the next request
      throw error;
    });
    return this.resolver;
  }

  private async discover(): Promise<JWTVerifyGetKey> {
    const issuer = this.config.get('KEYCLOAK_ISSUER_URL', { infer: true });
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
    const metadata = (await response.json()) as { issuer?: string; jwks_uri?: string };
    if (metadata.issuer !== issuer || !metadata.jwks_uri) {
      // A mismatch means misconfiguration (e.g. KC_HOSTNAME); fail closed.
      throw new Error('OIDC discovery returned an unexpected issuer or no jwks_uri');
    }
    this.logger.log('Keycloak OIDC discovery completed');
    return createRemoteJWKSet(new URL(metadata.jwks_uri), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
    });
  }
}

/**
 * Validates Keycloak access tokens with standard JOSE verification: signature (realm
 * JWKS), issuer, expiry/not-before, audience (this API), authorised party (the web
 * client) and token type. Payloads are never trusted without verification.
 */
@Injectable()
export class KeycloakTokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clientId: string;

  constructor(
    config: AppConfigService,
    @Inject(KEYCLOAK_KEY_RESOLVER) private readonly keys: () => Promise<JWTVerifyGetKey>,
  ) {
    this.issuer = config.get('KEYCLOAK_ISSUER_URL', { infer: true });
    this.audience = config.get('KEYCLOAK_AUDIENCE', { infer: true });
    this.clientId = config.get('KEYCLOAK_CLIENT_ID', { infer: true });
  }

  async verify(token: string): Promise<IdentityClaims> {
    let resolver: JWTVerifyGetKey;
    try {
      resolver = await this.keys();
    } catch {
      throw new TokenVerificationError('unavailable');
    }

    let payload: KeycloakAccessTokenPayload;
    try {
      ({ payload } = await jwtVerify<KeycloakAccessTokenPayload>(token, resolver, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ALGORITHMS,
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) throw new TokenVerificationError('expired');
      if (error instanceof joseErrors.JWKSTimeout) throw new TokenVerificationError('unavailable');
      if (error instanceof TypeError || (error instanceof Error && /fetch/i.test(error.message))) {
        throw new TokenVerificationError('unavailable');
      }
      throw new TokenVerificationError('invalid');
    }

    // Only access tokens issued to our web client are accepted (not ID/refresh tokens).
    if (payload.typ !== 'Bearer' || payload.azp !== this.clientId || !payload.sub) {
      throw new TokenVerificationError('invalid');
    }

    const roles = Array.isArray(payload.realm_access?.roles)
      ? payload.realm_access.roles.filter((r): r is string => typeof r === 'string')
      : [];
    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: payload.name ?? payload.preferred_username ?? null,
      roles,
      authTime: typeof payload.auth_time === 'number' ? payload.auth_time : null,
    };
  }
}
