import { Inject, Injectable } from '@nestjs/common';
import type { JobSourceItem } from '@job-assist/shared';
import { PrismaService } from '../../../database/prisma.service.js';
import { JOB_SOURCE_ADAPTERS, type JobSourceAdapter } from './job-source-adapter.js';

export interface ActiveSource {
  id: string;
  adapter: JobSourceAdapter;
}

/**
 * The enabled adapters and their job_sources rows (created on first use). The table holds
 * descriptive data and health only, never credentials.
 */
@Injectable()
export class JobSourceRegistry {
  constructor(
    @Inject(JOB_SOURCE_ADAPTERS) private readonly adapters: JobSourceAdapter[],
    private readonly prisma: PrismaService,
  ) {}

  /** Configured adapters with their source ids. */
  async active(): Promise<ActiveSource[]> {
    const result: ActiveSource[] = [];
    for (const adapter of this.adapters) {
      const row = await this.upsert(adapter);
      if (row.isEnabled) result.push({ id: row.id, adapter });
    }
    return result;
  }

  async list(): Promise<JobSourceItem[]> {
    const items: JobSourceItem[] = [];
    for (const adapter of this.adapters) {
      const row = await this.upsert(adapter);
      items.push({
        key: row.key,
        name: row.name,
        kind: row.kind,
        isDevelopment: row.isDevelopment,
        isEnabled: row.isEnabled,
        description: row.description,
      });
    }
    return items;
  }

  async recordHealth(sourceId: string, error: string | null): Promise<void> {
    await this.prisma.jobSource.update({
      where: { id: sourceId },
      data: error
        ? { lastFailureAt: new Date(), lastError: error }
        : { lastSuccessAt: new Date(), lastError: null },
    });
  }

  private upsert(adapter: JobSourceAdapter) {
    const d = adapter.descriptor;
    const fields = {
      name: d.name,
      kind: d.kind,
      isDevelopment: d.isDevelopment,
      isEnabled: adapter.isConfigured(),
      description: d.description,
    };
    return this.prisma.jobSource.upsert({
      where: { key: d.key },
      create: { key: d.key, ...fields },
      update: fields,
    });
  }
}
