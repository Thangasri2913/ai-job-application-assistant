import type { EmploymentType, SeniorityLevel, WorkMode } from '@job-assist/shared';
import {
  type JobSearchCriteria,
  JobSourceAdapter,
  type JobSourceDescriptor,
  JobSourceError,
  type SourceJobPosting,
} from './job-source-adapter.js';
import { DEV_JOB_FIXTURES, type DevRawJob, devJobUrl } from './dev-job-fixtures.js';

const ARRANGEMENT: Record<DevRawJob['arrangement'], WorkMode> = {
  office: 'ONSITE',
  hybrid: 'HYBRID',
  remote: 'REMOTE',
};
const CONTRACT: Record<DevRawJob['contract'], EmploymentType> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  Contract: 'CONTRACT',
  Internship: 'INTERNSHIP',
};
const LEVEL: Record<NonNullable<DevRawJob['level']>, SeniorityLevel> = {
  junior: 'JUNIOR',
  mid: 'MID',
  senior: 'SENIOR',
  lead: 'LEAD',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * DEV_JOB_SOURCE: built-in sample postings for development and tests (enable with
 * JOB_SOURCES=dev; refused in production). Jobs from it are flagged as sample data and
 * labelled as such in the UI. It performs a loose keyword search; the discovery pipeline
 * applies the alert's criteria itself, as it does for every source.
 */
export class DevJobSourceAdapter extends JobSourceAdapter<DevRawJob> {
  readonly descriptor: JobSourceDescriptor = {
    key: 'dev',
    name: 'Development sample jobs',
    kind: 'DEVELOPMENT',
    isDevelopment: true,
    description: 'Built-in fixture postings for development. Not real job listings.',
  };

  constructor(
    private readonly fixtures: DevRawJob[] = DEV_JOB_FIXTURES,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  isConfigured(): boolean {
    return true;
  }

  searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<DevRawJob[]> {
    if (signal.aborted) return Promise.reject(new JobSourceError('The search was cancelled.'));
    const words = criteria.keywords
      .flatMap((k) => k.toLowerCase().split(/\s+/))
      .filter((w) => w.length > 1);
    return Promise.resolve(
      this.fixtures
        .filter((job) => {
          const text = `${job.position} ${job.body}`.toLowerCase();
          return words.length === 0 || words.some((w) => text.includes(w.replace(/\.js$/, '')));
        })
        .slice(0, criteria.limit),
    );
  }

  getJobDetails(identifier: string): Promise<DevRawJob | null> {
    return Promise.resolve(this.fixtures.find((job) => job.ref === identifier) ?? null);
  }

  normalizeJob(raw: DevRawJob): SourceJobPosting {
    return {
      externalId: raw.ref,
      title: raw.position,
      companyName: raw.employer,
      location: raw.arrangement === 'remote' && !raw.city ? 'Remote' : raw.city,
      workMode: ARRANGEMENT[raw.arrangement],
      employmentType: CONTRACT[raw.contract],
      seniority: raw.level ? LEVEL[raw.level] : null,
      description: raw.body,
      sourceUrl: devJobUrl(raw.ref),
      postedAt: new Date(this.now().getTime() - raw.postedDaysAgo * DAY_MS),
    };
  }
}
