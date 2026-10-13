import { Inject, Injectable } from '@nestjs/common';
import type { JobSourceItem, SourceAttribution } from '@job-assist/shared';
import { PrismaService } from '../../../database/prisma.service.js';
import { SampleDataPolicy } from '../sample-data-policy.js';
import { JOB_SOURCE_ADAPTERS, type JobSourceAdapter } from './job-source-adapter.js';

const notIntegrated = (key: string, name: string): JobSourceItem => ({
  key,
  name,
  kind: 'API',
  isDevelopment: false,
  isEnabled: false,
  status: 'NOT_INTEGRATED',
  description: `${name} is not searched: this app has no public job search API it is permitted to use for ${name}, and it never signs in with your account or scrapes its pages.`,
  postingOrigin: null,
  attribution: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
});

/** Well-known job sites shown as not integrated, so users know they aren't searched. */
const NOT_INTEGRATED: JobSourceItem[] = [
  notIntegrated('linkedin', 'LinkedIn'),
  notIntegrated('naukri', 'Naukri'),
  notIntegrated('indeed', 'Indeed'),
];

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
    private readonly policy: SampleDataPolicy,
  ) {}

  /** The attribution a source's terms require, by key (null if none or unknown). */
  attributionFor(key: string): SourceAttribution | null {
    return this.adapters.find((a) => a.descriptor.key === key)?.descriptor.attribution ?? null;
  }

  /** Configured adapters with their source ids. */
  async active(): Promise<ActiveSource[]> {
    const result: ActiveSource[] = [];
    for (const adapter of this.adapters) {
      // Second guard (the startup selection is the first): sample data never runs where it
      // isn't allowed, i.e. in production.
      if (adapter.descriptor.isDevelopment && !this.policy.allowSampleData) continue;
      const row = await this.upsert(adapter);
      if (row.isEnabled) result.push({ id: row.id, adapter });
    }
    return result;
  }

  /** The enabled sources with their status and health, then the sites that aren't integrated. */
  async list(): Promise<JobSourceItem[]> {
    const items: JobSourceItem[] = [];
    for (const adapter of this.adapters) {
      const row = await this.upsert(adapter);
      const sampleBlocked = row.isDevelopment && !this.policy.allowSampleData;
      items.push({
        key: row.key,
        name: row.name,
        kind: row.kind,
        isDevelopment: row.isDevelopment,
        isEnabled: row.isEnabled && !sampleBlocked,
        status: sampleBlocked ? 'DEVELOPMENT_ONLY' : row.isEnabled ? 'ACTIVE' : 'NOT_CONFIGURED',
        description: row.description,
        postingOrigin: adapter.descriptor.postingOrigin,
        attribution: adapter.descriptor.attribution,
        lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
        lastError: row.lastError,
      });
    }
    return [...items, ...NOT_INTEGRATED];
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
