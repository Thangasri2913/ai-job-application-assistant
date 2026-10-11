import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../../common/decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { UsersService } from '../users/users.service.js';
import { KeycloakTokenVerifier, TokenVerificationError } from './keycloak-token-verifier.js';

/**
 * Global guard: every route requires a valid Keycloak access token unless marked
 * @Public(). On success the request carries a normalised AuthenticatedUser.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: KeycloakTokenVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { id?: string | number }>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw AppException.unauthorized(ErrorCode.UNAUTHORIZED, 'Authentication required.');
    }

    let claims;
    try {
      claims = await this.verifier.verify(token);
    } catch (error) {
      if (error instanceof TokenVerificationError) {
        if (error.reason === 'expired') {
          throw AppException.unauthorized(
            ErrorCode.TOKEN_EXPIRED,
            'Your session has expired. Please sign in again.',
          );
        }
        if (error.reason === 'unavailable') {
          throw new AppException(
            HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.IDENTITY_PROVIDER_UNAVAILABLE,
            'The sign-in service is unavailable. Please try again shortly.',
          );
        }
      }
      throw AppException.unauthorized(ErrorCode.UNAUTHORIZED, 'Authentication required.');
    }

    const user = await this.users.syncIdentity(
      claims,
      request.id === undefined ? undefined : String(request.id),
    );
    if (user.status !== 'ACTIVE') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.ACCOUNT_DISABLED,
        'This account has been disabled.',
      );
    }

    request.principal = {
      userId: user.id,
      keycloakSubject: claims.subject,
      email: user.email,
      name: user.fullName,
      roles: claims.roles,
    };
    return true;
  }
}
