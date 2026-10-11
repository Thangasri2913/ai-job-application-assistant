import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '@job-assist/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { AuditAction } from '../audit/audit-actions.js';
import { AuditService } from '../audit/audit.service.js';
import type { IdentityClaims } from '../auth/identity-claims.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Public projection of a user. */
export function toAuthUser(user: User, roles: string[]): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles,
    createdAt: user.createdAt.toISOString(),
  };
}

const displayName = (claims: IdentityClaims) => claims.name?.trim() || claims.email || 'New user';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Finds or creates the local user for a validated identity. Keyed by the Keycloak
   * subject (never by email). Only identity fields (email, display name) are synced;
   * application data such as the career profile is never touched.
   */
  async syncIdentity(claims: IdentityClaims, requestId?: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { keycloakSubject: claims.subject },
    });
    if (existing) return this.refresh(existing, claims, requestId);

    // Pre-Keycloak account with the same *verified* email → link it instead of duplicating.
    if (claims.email && claims.emailVerified) {
      const legacy = await this.prisma.user.findFirst({
        where: { email: claims.email, keycloakSubject: null },
      });
      if (legacy) {
        const linked = await this.prisma.user.update({
          where: { id: legacy.id },
          data: {
            keycloakSubject: claims.subject,
            emailVerifiedAt: legacy.emailVerifiedAt ?? new Date(),
          },
        });
        await this.audit.record({ action: AuditAction.USER_LINKED, userId: linked.id, requestId });
        return this.refresh(linked, claims, requestId);
      }
    }

    try {
      const created = await this.prisma.user.create({
        data: {
          keycloakSubject: claims.subject,
          email: claims.email ?? '',
          fullName: displayName(claims),
          emailVerifiedAt: claims.emailVerified ? new Date() : null,
          // Use Keycloak's authentication time so later logins compare like-for-like.
          lastLoginAt: claims.authTime ? new Date(claims.authTime * 1000) : new Date(),
        },
      });
      await this.audit.record({ action: AuditAction.USER_CREATED, userId: created.id, requestId });
      await this.audit.record({
        action: AuditAction.LOGIN_SUCCEEDED,
        userId: created.id,
        requestId,
      });
      return created;
    } catch (error) {
      // Two concurrent first requests: the other one created the row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.user.findUniqueOrThrow({ where: { keycloakSubject: claims.subject } });
      }
      throw error;
    }
  }

  /** Syncs safe identity fields and records a login when Keycloak reports a newer authentication. */
  private async refresh(user: User, claims: IdentityClaims, requestId?: string): Promise<User> {
    const email = claims.email ?? user.email;
    // The display name is user-editable in the app (career profile), so only fill it when empty.
    const fullName = user.fullName || displayName(claims);
    const authenticatedAt = claims.authTime ? new Date(claims.authTime * 1000) : null;
    const isNewLogin =
      authenticatedAt !== null && (!user.lastLoginAt || authenticatedAt > user.lastLoginAt);
    const verifiedNow = claims.emailVerified && !user.emailVerifiedAt;

    if (email === user.email && fullName === user.fullName && !isNewLogin && !verifiedNow)
      return user;

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        fullName,
        ...(isNewLogin ? { lastLoginAt: authenticatedAt } : {}),
        ...(verifiedNow ? { emailVerifiedAt: new Date() } : {}),
      },
    });
    if (isNewLogin)
      await this.audit.record({ action: AuditAction.LOGIN_SUCCEEDED, userId: user.id, requestId });
    if (email !== user.email)
      this.logger.log({ userId: user.id }, 'Synchronised email from identity provider');
    return updated;
  }
}
