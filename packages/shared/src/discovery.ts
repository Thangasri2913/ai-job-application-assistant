import type { MatchLevel, SeniorityLevel } from './jobs.js';
import type { EmploymentType, WorkMode } from './profile.js';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const REMOTE_PREFERENCES = ['ANY', 'REMOTE', 'HYBRID', 'ONSITE'] as const;
export type RemotePreference = (typeof REMOTE_PREFERENCES)[number];

export const REMOTE_PREFERENCE_LABELS: Record<RemotePreference, string> = {
  ANY: 'Any',
  REMOTE: 'Remote only',
  HYBRID: 'Hybrid or remote',
  ONSITE: 'On-site',
};

export const ALERT_SCHEDULE_TYPES = ['DAILY', 'WEEKLY', 'CUSTOM'] as const;
export type AlertScheduleType = (typeof ALERT_SCHEDULE_TYPES)[number];

export const ALERT_SCHEDULE_LABELS: Record<AlertScheduleType, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  CUSTOM: 'Custom days',
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** BEST_MATCH compares every active resume and recommends the best; DEFAULT_RESUME scores the default one. */
export const ALERT_RESUME_MODES = ['BEST_MATCH', 'DEFAULT_RESUME'] as const;
export type AlertResumeMode = (typeof ALERT_RESUME_MODES)[number];

export const ALERT_RESUME_MODE_LABELS: Record<AlertResumeMode, string> = {
  BEST_MATCH: 'Best of all my active resumes',
  DEFAULT_RESUME: 'My default resume',
};

export const JOB_SEARCH_TRIGGERS = ['SCHEDULED', 'MANUAL'] as const;
export type JobSearchTrigger = (typeof JOB_SEARCH_TRIGGERS)[number];

export const JOB_SEARCH_RUN_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL'] as const;
export type JobSearchRunStatus = (typeof JOB_SEARCH_RUN_STATUSES)[number];

export const JOB_SOURCE_KINDS = ['DEVELOPMENT', 'API', 'FEED'] as const;
export type JobSourceKind = (typeof JOB_SOURCE_KINDS)[number];

export const JOB_RECOMMENDATION_STATUSES = [
  'NEW',
  'VIEWED',
  'DISMISSED',
  'SAVED',
  'APPLIED',
] as const;
export type JobRecommendationStatus = (typeof JOB_RECOMMENDATION_STATUSES)[number];

export const JOB_RECOMMENDATION_STATUS_LABELS: Record<JobRecommendationStatus, string> = {
  NEW: 'New',
  VIEWED: 'Viewed',
  DISMISSED: 'Dismissed',
  SAVED: 'Saved',
  APPLIED: 'Applied',
};

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'PUSH'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'NEW_RECOMMENDATIONS',
  'ALERT_RUN_FAILED',
  'SMART_APPLY_INPUT_NEEDED',
  'SMART_APPLY_SUBMISSION_UPDATE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const JOB_ALERT_NAME_MAX_LENGTH = 100;
export const JOB_ALERT_MAX_KEYWORDS = 10;
export const JOB_ALERT_MAX_LOCATIONS = 10;
export const JOB_ALERT_TERM_MAX_LENGTH = 60;
export const JOB_ALERTS_PER_USER = 20;
export const DEFAULT_MINIMUM_MATCH_SCORE = 70;

/** Shown wherever development fixture postings appear. */
export const SAMPLE_DATA_NOTICE =
  'Development sample data: these postings come from built-in fixtures, not a real job board.';

// ─── Requests ────────────────────────────────────────────────────────────────

export interface JobAlertSchedule {
  type: AlertScheduleType;
  /** Local time "HH:mm" in `timezone`. */
  time: string;
  /** Weekdays (0 = Sunday): exactly one for WEEKLY, one or more for CUSTOM, empty for DAILY. */
  days: number[];
  /** IANA time zone, e.g. "Asia/Kolkata". */
  timezone: string;
}

export interface CreateJobAlertRequest {
  name: string;
  keywords: string[];
  locations?: string[];
  remotePreference?: RemotePreference;
  employmentTypes?: EmploymentType[];
  experienceLevel?: SeniorityLevel | null;
  /** 0–100. */
  minimumMatchScore?: number;
  resumeMode?: AlertResumeMode;
  isActive?: boolean;
  schedule?: JobAlertSchedule;
}

export type UpdateJobAlertRequest = Partial<CreateJobAlertRequest>;

// ─── Responses ───────────────────────────────────────────────────────────────

/**
 * ACTIVE: searched by alert runs. NOT_CONFIGURED: enabled but missing settings (e.g. API
 * credentials). DEVELOPMENT_ONLY: sample data, never used in production. NOT_INTEGRATED: a
 * well-known job site this app does not search (no permitted API is used for it).
 */
export const JOB_SOURCE_STATUSES = [
  'ACTIVE',
  'NOT_CONFIGURED',
  'DEVELOPMENT_ONLY',
  'NOT_INTEGRATED',
] as const;
export type JobSourceStatus = (typeof JOB_SOURCE_STATUSES)[number];

export const JOB_SOURCE_STATUS_LABELS: Record<JobSourceStatus, string> = {
  ACTIVE: 'Configured',
  NOT_CONFIGURED: 'Not configured',
  DEVELOPMENT_ONLY: 'Development only',
  NOT_INTEGRATED: 'Not integrated',
};

export interface JobSourceItem {
  key: string;
  name: string;
  kind: JobSourceKind;
  /** Development fixtures: never real listings. */
  isDevelopment: boolean;
  isEnabled: boolean;
  status: JobSourceStatus;
  description: string | null;
  /** EMPLOYER: the employer's own job board (original postings); AGGREGATOR: a job search service. */
  postingOrigin: 'EMPLOYER' | 'AGGREGATOR' | 'SAMPLE' | null;
  /** Attribution the source's terms require next to each displayed job (e.g. "Jobs by Adzuna"). */
  attribution: SourceAttribution | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** Safe, user-facing message of the last failure; never credentials. */
  lastError: string | null;
}

export interface SourceAttribution {
  label: string;
  url: string;
}

/** The search terms a run actually used (the alert's, completed from the Career Profile). */
export interface JobSearchStrategy {
  /** Alert keywords first, then alternate titles from the profile. */
  keywords: string[];
  /** Titles added from the Career Profile (preferred roles, current title). */
  alternateTitles: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | null;
  /** Which criteria came from the alert and which from the Career Profile. */
  basis: {
    locations: 'ALERT' | 'PROFILE' | 'NONE';
    remotePreference: 'ALERT' | 'PROFILE';
    employmentTypes: 'ALERT' | 'PROFILE';
  };
}

export interface JobSearchSourceResult {
  sourceKey: string;
  sourceName: string;
  isDevelopment: boolean;
  status: 'OK' | 'FAILED';
  /** Postings the source returned. */
  returned?: number;
  /** Postings that matched the search criteria. */
  found: number;
  /** Safe, user-facing message; never credentials or raw provider output. */
  error: string | null;
}

export interface JobSearchRunItem {
  id: string;
  alertId: string;
  trigger: JobSearchTrigger;
  status: JobSearchRunStatus;
  /** Postings the sources returned. */
  jobsDiscovered: number;
  /** Postings that matched the search criteria. */
  jobsFound: number;
  jobsCreated: number;
  jobsSkipped: number;
  belowThreshold: number;
  recommendationsCreated: number;
  /** Postings matching a job the user already has. */
  duplicates: number;
  /** Jobs fully analysed against the user's active resumes. */
  jobsAnalyzed: number;
  sources: JobSearchSourceResult[];
  searchStrategy: JobSearchStrategy | null;
  errorMessage: string | null;
  note: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface JobAlertItem {
  id: string;
  name: string;
  keywords: string[];
  locations: string[];
  remotePreference: RemotePreference;
  employmentTypes: EmploymentType[];
  experienceLevel: SeniorityLevel | null;
  minimumMatchScore: number;
  resumeMode: AlertResumeMode;
  isActive: boolean;
  schedule: JobAlertSchedule;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRun: JobSearchRunItem | null;
  /** Recommendations this alert produced that are not dismissed. */
  recommendationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecommendationItem {
  id: string;
  status: JobRecommendationStatus;
  /** Compatibility score of the recommended resume version; not a hiring probability. */
  matchScore: number;
  level: MatchLevel;
  /** Ranking score 0–100 used to order recommendations. */
  rank: number;
  reason: string;
  reasons: string[];
  gaps: string[];
  requiredSkills: { matched: string[]; missing: string[] };
  resume: {
    resumeId: string | null;
    resumeVersionId: string | null;
    resumeName: string | null;
    versionNumber: number | null;
  } | null;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    employmentType: EmploymentType | null;
    workMode: WorkMode | null;
    jobUrl: string | null;
    postedAt: string | null;
    isSampleData: boolean;
  };
  source: {
    key: string;
    name: string;
    isDevelopment: boolean;
    attribution: SourceAttribution | null;
    /** Where exactly the posting was found, e.g. "Greenhouse job board: acme". */
    discoveredFrom: string | null;
  } | null;
  alert: { id: string; name: string } | null;
  createdAt: string;
  viewedAt: string | null;
  savedAt: string | null;
  dismissedAt: string | null;
  appliedAt: string | null;
}

export interface NotificationItem {
  id: string;
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unreadCount: number;
}

/** Dashboard counts of NEW recommendations by match level. */
export interface RecommendationOverview {
  new: number;
  /** ≥ 70. */
  strong: number;
  /** 50–69. */
  moderate: number;
  /** < 50. */
  low: number;
}
