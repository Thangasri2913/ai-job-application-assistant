import type {
  EmploymentType,
  JobSourceKind,
  RemotePreference,
  SeniorityLevel,
  WorkMode,
} from '@job-assist/shared';

/**
 * What a source is asked for. Deliberately limited to the alert's search terms: no
 * profile, resume or contact data is ever sent to a job source.
 */
export interface JobSearchCriteria {
  keywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | null;
  /** Maximum postings to return. */
  limit: number;
}

/** A posting in the application's common shape, as an adapter reports it. */
export interface SourceJobPosting {
  /** Stable id of the posting at the source. */
  externalId: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  seniority: SeniorityLevel | null;
  description: string;
  /** Public URL of the posting, when the source provides one. */
  sourceUrl: string | null;
  postedAt: Date | null;
}

export interface JobSourceDescriptor {
  /** Stable key, used in JOB_SOURCES and stored in job_sources.key. */
  key: string;
  name: string;
  kind: JobSourceKind;
  /** Development fixtures: postings are samples and must never be presented as real. */
  isDevelopment: boolean;
  description: string;
}

/**
 * One job source. Implementations may only use legitimate, supported mechanisms (official
 * APIs or published feeds) within the provider's terms: no scraping of restricted pages,
 * no CAPTCHA or bot-detection bypass, no logging in as the user. Credentials come from
 * environment variables only and must never be logged or stored in the database.
 */
export abstract class JobSourceAdapter<Raw = unknown> {
  abstract readonly descriptor: JobSourceDescriptor;

  /** False when required configuration (e.g. an API key) is missing; the source is then skipped. */
  abstract isConfigured(): boolean;

  abstract searchJobs(criteria: JobSearchCriteria, signal: AbortSignal): Promise<Raw[]>;

  abstract getJobDetails(identifier: string, signal: AbortSignal): Promise<Raw | null>;

  /** Maps the provider's raw shape to the common shape. Throws if the posting is unusable. */
  abstract normalizeJob(raw: Raw): SourceJobPosting;
}

/** A failure whose message is safe to show the user and store (no credentials or raw output). */
export class JobSourceError extends Error {}

/** DI token: the adapters enabled by JOB_SOURCES (see job-discovery.module.ts). */
export const JOB_SOURCE_ADAPTERS = Symbol('JOB_SOURCE_ADAPTERS');
