import { Logger } from '@nestjs/common';
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
 * Greenhouse Job Board API (https://developers.greenhouse.io/job-board.html): employers'
 * public job boards. "Job Board data is publicly available, so authentication is not
 * required for any GET endpoints." Only the boards configured in GREENHOUSE_BOARDS are read
 * (no crawling for boards); postings link to the employer's own posting (absolute_url).
 */
export interface GreenhouseJob {
  id: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string } | null;
  /** HTML-escaped HTML (content=true). */
  content?: string;
  first_published?: string;
  updated_at?: string;
  company_name?: string;
  /** Added by this adapter: which board the job came from. */
  board?: { token: string; name: string };
}

export interface GreenhouseConfig {
  /** Board tokens, each optionally with the employer's display name. */
  boards: { id: string; name?: string }[];
}

const API_BASE = 'https://boards-api.greenhouse.io/v1/boards';
/** Boards change slowly; one fetch per board per hour is shared by every alert. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;

export class GreenhouseJobSourceAdapter extends JobSourceAdapter<GreenhouseJob> {
  readonly descriptor: JobSourceDescriptor;
  private readonly logger = new Logger('GreenhouseJobSource');
  private readonly cache: TtlCache<GreenhouseJob[]>;

  constructor(
    private readonly config: GreenhouseConfig,
    private readonly fetchFn: Fetch = defaultFetch,
    now: () => number = () => Date.now(),
  ) {
    super();
    this.cache = new TtlCache(CACHE_TTL_MS, now);
    this.descriptor = {
      key: 'greenhouse',
      name: 'Greenhouse',
      kind: 'API',
      isDevelopment: false,
      description: `Jobs from ${config.boards.length} employer job board${
        config.boards.length === 1 ? '' : 's'
      } hosted on Greenhouse (public Job Board API).`,
      attribution: null,
      postingOrigin: 'EMPLOYER',
    };
  }

  isConfigured(): boolean {
    return this.config.boards.length > 0;
  }

  async searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<GreenhouseJob[]> {
    if (!this.isConfigured()) throw new JobSourceError('No Greenhouse job boards are configured.');
    const outcomes = await mapLimited(this.config.boards, CONCURRENCY, (board) =>
      this.cache.get(board.id, () => this.fetchBoard(board, signal)),
    );
    const failed = outcomes.filter((o) => o.status === 'rejected');
    if (failed.length === outcomes.length) {
      const first: unknown = (failed[0] as PromiseRejectedResult).reason;
      throw first instanceof JobSourceError
        ? first
        : new JobSourceError('No Greenhouse job board could be read.');
    }
    for (const [i, o] of outcomes.entries()) {
      if (o.status === 'rejected') {
        const reason = o.reason instanceof JobSourceError ? o.reason.message : 'unexpected error';
        this.logger.warn({ board: this.config.boards[i]!.id, reason }, 'Greenhouse board skipped');
      }
    }
    return outcomes
      .flatMap((o) => (o.status === 'fulfilled' ? o.value : []))
      .filter((job) => titleMatchesAny(job.title ?? '', criteria.keywords));
  }

  getJobDetails(): Promise<GreenhouseJob | null> {
    return Promise.resolve(null);
  }

  normalizeJob(job: GreenhouseJob): SourceJobPosting {
    const title = htmlToText(job.title ?? '');
    const company = job.board?.name ?? htmlToText(job.company_name ?? '');
    const description = htmlToText(job.content ?? '');
    if (!title || !company || !description || !job.board) {
      throw new Error('Greenhouse job is missing a title, company or description.');
    }
    const location = job.location?.name?.trim() || null;
    const published = job.first_published ? new Date(job.first_published) : null;
    return {
      externalId: `${job.board.token}:${job.id}`,
      title,
      companyName: company,
      location,
      workMode: workModeFrom(location),
      employmentType: null,
      seniority: null,
      description,
      sourceUrl: job.absolute_url ?? null,
      // updated_at is not a posting date, so only first_published is used.
      postedAt: published && !Number.isNaN(published.getTime()) ? published : null,
      discoveredFrom: `Greenhouse job board: ${job.board.token}`,
    };
  }

  private async fetchBoard(
    board: { id: string; name?: string },
    signal: AbortSignal,
  ): Promise<GreenhouseJob[]> {
    const token = encodeURIComponent(board.id);
    let name = board.name;
    if (!name) {
      // The employer's name as the board itself states it; never guessed from the token.
      const info = await getJson(this.fetchFn, `${API_BASE}/${token}`, 'Greenhouse', signal);
      name = htmlToText((info.body as { name?: string } | null)?.name ?? '') || undefined;
    }
    const { status, body } = await getJson(
      this.fetchFn,
      `${API_BASE}/${token}/jobs?content=true`,
      'Greenhouse',
      signal,
    );
    if (status === 404) {
      throw new JobSourceError(`The Greenhouse job board “${board.id}” was not found.`);
    }
    const jobs = (body as { jobs?: unknown } | null)?.jobs;
    if (!Array.isArray(jobs)) {
      throw new JobSourceError('Greenhouse returned an unexpected response.');
    }
    return jobs
      .filter((j): j is GreenhouseJob => typeof j === 'object' && j !== null && 'id' in j)
      .map((j) => {
        const company = name ?? htmlToText(j.company_name ?? '');
        return company ? { ...j, board: { token: board.id, name: company } } : j;
      });
  }
}
