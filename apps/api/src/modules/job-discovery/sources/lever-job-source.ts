import { Logger } from '@nestjs/common';
import type { EmploymentType, WorkMode } from '@job-assist/shared';
import {
  defaultFetch,
  type Fetch,
  getJson,
  htmlToText,
  mapLimited,
  titleMatchesAny,
  TtlCache,
  workModeFrom,
} from './http.js';
import {
  type JobSearchCriteria,
  JobSourceAdapter,
  type JobSourceDescriptor,
  JobSourceError,
  type SourceJobPosting,
} from './job-source-adapter.js';

/**
 * Lever Postings API (https://github.com/lever/postings-api): the public, unauthenticated
 * GET endpoint employers' job sites are built on. Only the sites configured in LEVER_SITES
 * are read; postings link to the employer's own Lever-hosted posting (hostedUrl).
 */
export interface LeverPosting {
  id: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  country?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
    allLocations?: string[];
  };
  descriptionPlain?: string;
  description?: string;
  lists?: { text?: string; content?: string }[];
  additionalPlain?: string;
  /** Added by this adapter: which site the posting came from. */
  site?: { id: string; name: string };
}

export interface LeverConfig {
  /** Lever site names, each optionally with the employer's display name. */
  sites: { id: string; name?: string }[];
  /** Lever's EU data centre uses a separate host. */
  region: 'global' | 'eu';
}

const HOSTS = { global: 'https://api.lever.co', eu: 'https://api.eu.lever.co' };
const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;

const WORKPLACE: Record<string, WorkMode> = {
  remote: 'REMOTE',
  hybrid: 'HYBRID',
  'on-site': 'ONSITE',
  onsite: 'ONSITE',
};

export class LeverJobSourceAdapter extends JobSourceAdapter<LeverPosting> {
  readonly descriptor: JobSourceDescriptor;
  private readonly logger = new Logger('LeverJobSource');
  private readonly cache: TtlCache<LeverPosting[]>;

  constructor(
    private readonly config: LeverConfig,
    private readonly fetchFn: Fetch = defaultFetch,
    now: () => number = () => Date.now(),
  ) {
    super();
    this.cache = new TtlCache(CACHE_TTL_MS, now);
    this.descriptor = {
      key: 'lever',
      name: 'Lever',
      kind: 'API',
      isDevelopment: false,
      description: `Jobs from ${config.sites.length} employer job site${
        config.sites.length === 1 ? '' : 's'
      } hosted on Lever (public Postings API).`,
      attribution: null,
      postingOrigin: 'EMPLOYER',
    };
  }

  isConfigured(): boolean {
    return this.config.sites.length > 0;
  }

  async searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<LeverPosting[]> {
    if (!this.isConfigured()) throw new JobSourceError('No Lever job sites are configured.');
    const outcomes = await mapLimited(this.config.sites, CONCURRENCY, (site) =>
      this.cache.get(site.id, () => this.fetchSite(site, signal)),
    );
    const failed = outcomes.filter((o) => o.status === 'rejected');
    if (failed.length === outcomes.length) {
      const first: unknown = (failed[0] as PromiseRejectedResult).reason;
      throw first instanceof JobSourceError
        ? first
        : new JobSourceError('No Lever job site could be read.');
    }
    for (const [i, o] of outcomes.entries()) {
      if (o.status === 'rejected') {
        const reason = o.reason instanceof JobSourceError ? o.reason.message : 'unexpected error';
        this.logger.warn({ site: this.config.sites[i]!.id, reason }, 'Lever site skipped');
      }
    }
    return outcomes
      .flatMap((o) => (o.status === 'fulfilled' ? o.value : []))
      .filter((p) => titleMatchesAny(p.text ?? '', criteria.keywords));
  }

  getJobDetails(): Promise<LeverPosting | null> {
    return Promise.resolve(null);
  }

  normalizeJob(p: LeverPosting): SourceJobPosting {
    const title = (p.text ?? '').trim();
    const description = [
      p.descriptionPlain ?? htmlToText(p.description ?? ''),
      ...(p.lists ?? []).map((l) => `${l.text ?? ''}\n${htmlToText(l.content ?? '')}`),
      p.additionalPlain ?? '',
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n\n');
    if (!title || !description || !p.site) {
      throw new Error('Lever posting is missing a title, company or description.');
    }
    const location = p.categories?.location?.trim() || null;
    const created = typeof p.createdAt === 'number' ? new Date(p.createdAt) : null;
    return {
      externalId: `${p.site.id}:${p.id}`,
      title,
      companyName: p.site.name,
      location,
      workMode: WORKPLACE[(p.workplaceType ?? '').toLowerCase()] ?? workModeFrom(location),
      employmentType: commitmentType(p.categories?.commitment),
      seniority: null,
      description,
      sourceUrl: p.hostedUrl ?? null,
      postedAt: created && !Number.isNaN(created.getTime()) ? created : null,
      discoveredFrom: `Lever job site: ${p.site.id}`,
    };
  }

  private async fetchSite(
    site: { id: string; name?: string },
    signal: AbortSignal,
  ): Promise<LeverPosting[]> {
    const url = `${HOSTS[this.config.region]}/v0/postings/${encodeURIComponent(site.id)}?mode=json`;
    const { status, body } = await getJson(this.fetchFn, url, 'Lever', signal);
    if (status === 404) {
      throw new JobSourceError(`The Lever job site “${site.id}” was not found.`);
    }
    if (!Array.isArray(body)) throw new JobSourceError('Lever returned an unexpected response.');
    // Lever postings carry no company name: the configured name (or the site name the
    // operator configured) identifies the employer.
    const name = site.name ?? site.id;
    return body
      .filter((p): p is LeverPosting => typeof p === 'object' && p !== null && 'id' in p)
      .map((p) => ({ ...p, site: { id: site.id, name } }));
  }
}

function commitmentType(commitment: string | undefined): EmploymentType | null {
  if (!commitment) return null;
  if (/intern/i.test(commitment)) return 'INTERNSHIP';
  if (/part[\s-]?time/i.test(commitment)) return 'PART_TIME';
  if (/full[\s-]?time|permanent/i.test(commitment)) return 'FULL_TIME';
  if (/freelance/i.test(commitment)) return 'FREELANCE';
  if (/contract/i.test(commitment)) return 'CONTRACT';
  if (/temp/i.test(commitment)) return 'TEMPORARY';
  return null;
}
