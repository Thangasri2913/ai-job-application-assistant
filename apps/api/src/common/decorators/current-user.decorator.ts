import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The authenticated caller, as the rest of the application sees it. Built by the
 * global AuthGuard from a validated Keycloak access token plus the local user record;
 * no other module needs to know about tokens or Keycloak claims.
 */
export interface AuthenticatedUser {
  /** Local application user id — use this for all user-owned data. */
  userId: string;
  keycloakSubject: string;
  email: string;
  name: string;
  roles: string[];
}

/** @deprecated Older name kept for existing modules; same shape as AuthenticatedUser. */
export type AuthenticatedPrincipal = AuthenticatedUser;

export type AuthenticatedRequest = Request & { principal?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      // Programming error: route is @Public() but asks for the user.
      throw new Error('CurrentUser used on a route without an authenticated principal');
    }
    return request.principal;
  },
);
