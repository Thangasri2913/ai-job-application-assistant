import type { EmploymentType } from '@job-assist/shared';
import {
  type JobSearchCriteria,
  JobSourceAdapter,
  type JobSourceDescriptor,
  JobSourceError,
  type SourceJobPosting,
} from './job-source-adapter.js';

/**
 * Adzuna job search API — an official, documented API (https://developer.adzuna.com,
 * spec: https://api.adzuna.com/v1/api-docs). Real job ads; no scraping.
 *
 * Terms (developer.adzuna.com/docs/terms_of_service): ads may be published with an
 * "Adzuna" label linking to Adzuna; default allowance 25 requests/minute and 250/day.
 * Credentials (app_id/app_key) come from the environment and never appear in logs or errors.
 */
export interface AdzunaConfig {
  appId?: string;
  appKey?: string;
  /** Adzuna country code, e.g. "in". */
  country: string;
  maxDaysOld: number;
  dailyRequestLimit: number;
}

/** Shape of one ad in Adzuna's search response (Adzuna::API::Response::Ad). */
export interface AdzunaAd {
  id: string | number;
  title?: string;
  description?: string;
  full_description?: string;
  created?: string;
  redirect_url?: string;
  location?: { display_name?: string; area?: string[] };
  company?: { display_name?: string };
  contract_time?: string;
  contract_type?: string;
}

type Fetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const API_BASE = 'https://api.adzuna.com/v1/api/jobs';
const RESULTS_PER_PAGE = 50;
/** Requests per alert run: keywords × locations, capped to protect the daily allowance. */
const MAX_REQUESTS_PER_SEARCH = 4;
const PER_MINUTE_LIMIT = 20; // under Adzuna's 25/minute

/** Adzuna's local site per country, for the required attribution link. */
const LOCAL_SITE: Record<string, string> = {
  gb: 'https://www.adzuna.co.uk',
  in: 'https://www.adzuna.in',
  us: 'https://www.adzuna.com',
  au: 'https://www.adzuna.com.au',
  ca: 'https://www.adzuna.ca',
  de: 'https://www.adzuna.de',
  fr: 'https://www.adzuna.fr',
  nl: 'https://www.adzuna.nl',
  nz: 'https://www.adzuna.co.nz',
  za: 'https://www.adzuna.co.za',
  sg: 'https://www.adzuna.sg',
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};
/** Adzuna highlights matches with <strong> tags; keep plain text only. */
export function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class AdzunaJobSourceAdapter extends JobSourceAdapter<AdzunaAd> {
  readonly descriptor: JobSourceDescriptor;
  /** Request timestamps (ms) in this process, for the per-minute and per-day budget. */
  private readonly requests: number[] = [];

  constructor(
    private readonly config: AdzunaConfig,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
    private readonly now: () => number = () => Date.now(),
  ) {
    super();
    this.descriptor = {
      key: 'adzuna',
      name: 'Adzuna',
      kind: 'API',
      isDevelopment: false,
      description: `Real job ads from the Adzuna job search API (${config.country.toUpperCase()}).`,
      attribution: {
        label: 'Jobs by Adzuna',
        url: LOCAL_SITE[config.country] ?? 'https://www.adzuna.com',
      },
      postingOrigin: 'AGGREGATOR',
    };
  }

  isConfigured(): boolean {
    return Boolean(this.config.appId && this.config.appKey);
  }

  async searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<AdzunaAd[]> {
    if (!this.isConfigured()) throw new JobSourceError('Adzuna is not configured on this server.');
    const keywords = criteria.keywords.length > 0 ? criteria.keywords : [''];
    const places = criteria.locations.length > 0 ? criteria.locations : [''];
    const queries = keywords
      .flatMap((what) => places.map((where) => ({ what, where })))
      .slice(0, MAX_REQUESTS_PER_SEARCH);
    const seen = new Set<string>();
    const ads: AdzunaAd[] = [];
    for (const q of queries) {
      for (const ad of await this.request(q.what, q.where, criteria, signal)) {
        const id = String(ad.id);
        if (seen.has(id)) continue;
        seen.add(id);
        ads.push(ad);
        if (ads.length >= criteria.limit) return ads;
      }
    }
    return ads;
  }

  /** Adzuna has no single-ad endpoint; details come with the search results. */
  getJobDetails(): Promise<AdzunaAd | null> {
    return Promise.resolve(null);
  }

  normalizeJob(ad: AdzunaAd): SourceJobPosting {
    const company = plainText(ad.company?.display_name ?? '');
    const title = plainText(ad.title ?? '');
    const description = plainText(ad.full_description || ad.description || '');
    // Never invent missing facts: an ad without a company or title is skipped.
    if (!company || !title || !description) {
      throw new Error('Adzuna ad is missing a title, company or description.');
    }
    const created = ad.created ? new Date(ad.created) : null;
    return {
      externalId: String(ad.id),
      title,
      companyName: company,
      location: ad.location?.display_name ? plainText(ad.location.display_name) : null,
      // Adzuna has no work-arrangement field; only an explicit "remote" in the title counts.
      workMode: /\bremote\b/i.test(title) ? 'REMOTE' : null,
      employmentType: employmentType(ad),
      seniority: null,
      description,
      sourceUrl: ad.redirect_url ?? null,
      postedAt: created && !Number.isNaN(created.getTime()) ? created : null,
      discoveredFrom: `Adzuna search API (${this.config.country.toUpperCase()})`,
    };
  }

  private async request(
    what: string,
    where: string,
    criteria: JobSearchCriteria,
    signal: AbortSignal,
  ): Promise<AdzunaAd[]> {
    this.reserveRequest();
    const params = new URLSearchParams({
      app_id: this.config.appId!,
      app_key: this.config.appKey!,
      results_per_page: String(Math.min(RESULTS_PER_PAGE, criteria.limit)),
      max_days_old: String(this.config.maxDaysOld),
      sort_by: 'date',
    });
    if (what) params.set('what', what);
    if (where) params.set('where', where);
    if (criteria.employmentTypes.length === 1) {
      const filter = { FULL_TIME: 'full_time', PART_TIME: 'part_time', CONTRACT: 'contract' }[
        criteria.employmentTypes[0] as 'FULL_TIME' | 'PART_TIME' | 'CONTRACT'
      ];
      if (filter) params.set(filter, '1');
    }
    let response;
    try {
      response = await this.fetchFn(
        `${API_BASE}/${encodeURIComponent(this.config.country)}/search/1?${params.toString()}`,
        { signal, headers: { Accept: 'application/json' } },
      );
    } catch {
      // The underlying error may include the URL (and so the key): report a safe message only.
      throw new JobSourceError(
        'Adzuna could not be reached. It will be tried again on the next run.',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new JobSourceError(
        'Adzuna rejected the API credentials (check ADZUNA_APP_ID / ADZUNA_APP_KEY).',
      );
    }
    if (response.status === 429) {
      throw new JobSourceError('Adzuna’s request limit was reached. It will be tried again later.');
    }
    if (!response.ok) {
      throw new JobSourceError(`Adzuna returned an error (HTTP ${response.status}).`);
    }
    const body = (await response.json()) as { results?: unknown };
    if (!Array.isArray(body.results)) {
      throw new JobSourceError('Adzuna returned an unexpected response.');
    }
    return body.results.filter(
      (r): r is AdzunaAd => typeof r === 'object' && r !== null && 'id' in r,
    );
  }

  /** Keeps this process within the per-minute and daily allowance. */
  private reserveRequest(): void {
    const now = this.now();
    while (this.requests.length > 0 && now - this.requests[0]! > 24 * 60 * 60 * 1000) {
      this.requests.shift();
    }
    if (this.requests.length >= this.config.dailyRequestLimit) {
      throw new JobSourceError(
        'The daily Adzuna request allowance is used up. Alerts will search again tomorrow.',
      );
    }
    if (this.requests.filter((t) => now - t < 60_000).length >= PER_MINUTE_LIMIT) {
      throw new JobSourceError(
        'Too many Adzuna requests in the last minute. It will be tried again on the next run.',
      );
    }
    this.requests.push(now);
  }
}

function employmentType(ad: AdzunaAd): EmploymentType | null {
  if (ad.contract_type === 'contract') return 'CONTRACT';
  if (ad.contract_time === 'full_time') return 'FULL_TIME';
  if (ad.contract_time === 'part_time') return 'PART_TIME';
  return null;
}
