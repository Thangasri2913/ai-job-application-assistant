import type { EmploymentType } from '@job-assist/shared';
import {
  defaultFetch,
  type Fetch,
  getJson,
  htmlToText,
  titleMatchesAny,
  TtlCache,
} from './http.js';
import {
  type JobSearchCriteria,
  JobSourceAdapter,
  type JobSourceDescriptor,
  JobSourceError,
  type SourceJobPosting,
} from './job-source-adapter.js';

/**
 * Remotive public remote-jobs API (https://github.com/remotive-com/remote-jobs-api), shared
 * by Remotive "so that developers can share our jobs further". Terms honoured here:
 * - every job links back to its Remotive URL and names Remotive as the source;
 * - at most a few requests a day (Remotive asks for no more than ~4/day and blocks
 *   more than 2/minute): one cached fetch of the feed serves every alert and user;
 * - jobs are never submitted to other job boards (this app only shows them to the user).
 * Remotive delays its public feed by 24 hours, and every job is remote.
 */
export interface RemotiveJob {
  id: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export interface RemotiveConfig {
  /** Feed requests per day (Remotive asks for no more than 4). */
  dailyRequestLimit: number;
}

const FEED_URL = 'https://remotive.com/api/remote-jobs';
/** One feed fetch per 6 hours keeps a process at ≤ 4 requests a day. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const JOB_TYPES: Record<string, EmploymentType> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACT',
  freelance: 'FREELANCE',
  internship: 'INTERNSHIP',
};

export class RemotiveJobSourceAdapter extends JobSourceAdapter<RemotiveJob> {
  readonly descriptor: JobSourceDescriptor = {
    key: 'remotive',
    name: 'Remotive',
    kind: 'API',
    isDevelopment: false,
    description: 'Remote jobs from the Remotive public API (listed 24 hours after publication).',
    attribution: { label: 'Jobs from Remotive', url: 'https://remotive.com' },
    postingOrigin: 'AGGREGATOR',
  };
  private readonly cache: TtlCache<RemotiveJob[]>;
  private readonly requests: number[] = [];

  constructor(
    private readonly config: RemotiveConfig,
    private readonly fetchFn: Fetch = defaultFetch,
    private readonly now: () => number = () => Date.now(),
  ) {
    super();
    this.cache = new TtlCache(CACHE_TTL_MS, now);
  }

  /** The public feed needs no credentials. */
  isConfigured(): boolean {
    return true;
  }

  async searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<RemotiveJob[]> {
    // Remote-only source: nothing to offer an on-site-only search.
    if (criteria.remotePreference === 'ONSITE') return [];
    const feed = await this.cache.get('feed', () => this.fetchFeed(signal));
    return feed.filter((job) => titleMatchesAny(job.title ?? '', criteria.keywords));
  }

  /** The feed carries full jobs; there is no separate details call. */
  getJobDetails(): Promise<RemotiveJob | null> {
    return Promise.resolve(null);
  }

  normalizeJob(job: RemotiveJob): SourceJobPosting {
    const title = htmlToText(job.title ?? '');
    const company = htmlToText(job.company_name ?? '');
    const description = htmlToText(job.description ?? '');
    if (!title || !company || !description) {
      throw new Error('Remotive job is missing a title, company or description.');
    }
    const published = job.publication_date ? new Date(job.publication_date) : null;
    const region = job.candidate_required_location?.trim();
    return {
      externalId: String(job.id),
      title,
      companyName: company,
      // Remotive states where candidates may be located (e.g. "Worldwide", "India").
      location: region ? `Remote (${region})` : 'Remote',
      workMode: 'REMOTE',
      employmentType: (job.job_type && JOB_TYPES[job.job_type]) || null,
      seniority: null,
      description,
      sourceUrl: job.url ?? null,
      postedAt: published && !Number.isNaN(published.getTime()) ? published : null,
      discoveredFrom: 'Remotive public API',
    };
  }

  private async fetchFeed(signal: AbortSignal): Promise<RemotiveJob[]> {
    const now = this.now();
    while (this.requests.length > 0 && now - this.requests[0]! > DAY_MS) this.requests.shift();
    if (this.requests.length >= this.config.dailyRequestLimit) {
      throw new JobSourceError(
        'The daily Remotive request allowance is used up. It will be searched again tomorrow.',
      );
    }
    this.requests.push(now);
    const { status, body } = await getJson(this.fetchFn, FEED_URL, 'Remotive', signal);
    const jobs = status === 200 ? (body as { jobs?: unknown } | null)?.jobs : undefined;
    if (!Array.isArray(jobs)) throw new JobSourceError('Remotive returned an unexpected response.');
    return jobs.filter((j): j is RemotiveJob => typeof j === 'object' && j !== null && 'id' in j);
  }
}
