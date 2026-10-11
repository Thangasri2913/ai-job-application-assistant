import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export interface AiUsageRecord {
  userId: string;
  applicationId?: string | null;
  operation: string;
  provider: string;
  model: string | null;
  status: 'SUCCEEDED' | 'INVALID' | 'FAILED';
  attempts: number;
}

/**
 * Records AI operations for future metering and cost reporting. Stores ids and outcome
 * only — never prompts, inputs or outputs. Recording never fails the user's request.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AiUsageRecord): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: { ...entry, applicationId: entry.applicationId ?? null },
      });
    } catch (error) {
      this.logger.warn({ err: error, operation: entry.operation }, 'Could not record AI usage');
    }
  }
}
