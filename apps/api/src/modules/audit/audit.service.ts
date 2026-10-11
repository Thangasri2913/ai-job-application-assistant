import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditAction } from './audit-actions.js';

export interface AuditEntry {
  action: AuditAction;
  userId?: string | null;
  requestId?: string;
  /** Non-sensitive context only: never secrets, tokens, passwords or document contents. */
  metadata?: Prisma.InputJsonObject;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an audit event. A failure to write the audit row is logged but does
   * not fail the user's request.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          userId: entry.userId ?? null,
          requestId: entry.requestId ?? null,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  }
}
