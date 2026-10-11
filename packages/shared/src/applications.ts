/**
 * Application pipeline stages, in display order. Persisted as the `ApplicationStatus`
 * enum; the API rejects anything else.
 */
export const APPLICATION_STATUSES = [
  'SAVED',
  'PREPARING',
  'APPLIED',
  'RECRUITER_SCREEN',
  'ASSESSMENT',
  'INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'NO_RESPONSE',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  PREPARING: 'Preparing',
  APPLIED: 'Applied',
  RECRUITER_SCREEN: 'Recruiter Screen',
  ASSESSMENT: 'Assessment',
  INTERVIEW: 'Interview',
  FINAL_INTERVIEW: 'Final Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  NO_RESPONSE: 'No Response',
};

/** Statuses an application can be created in (the user may record one already applied for). */
export const INITIAL_APPLICATION_STATUSES = [
  'SAVED',
  'PREPARING',
  'APPLIED',
] as const satisfies readonly ApplicationStatus[];
export type InitialApplicationStatus = (typeof INITIAL_APPLICATION_STATUSES)[number];

/**
 * Allowed forward/sideways moves. In addition, the API always allows going back to the
 * immediately previous status (to correct a mistake); history is never rewritten.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SAVED: ['PREPARING', 'APPLIED', 'WITHDRAWN'],
  PREPARING: ['SAVED', 'APPLIED', 'WITHDRAWN'],
  APPLIED: [
    'RECRUITER_SCREEN',
    'ASSESSMENT',
    'INTERVIEW',
    'OFFER',
    'REJECTED',
    'WITHDRAWN',
    'NO_RESPONSE',
  ],
  RECRUITER_SCREEN: [
    'ASSESSMENT',
    'INTERVIEW',
    'FINAL_INTERVIEW',
    'OFFER',
    'REJECTED',
    'WITHDRAWN',
    'NO_RESPONSE',
  ],
  ASSESSMENT: ['INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE'],
  INTERVIEW: ['ASSESSMENT', 'FINAL_INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE'],
  FINAL_INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE'],
  OFFER: ['REJECTED', 'WITHDRAWN'],
  REJECTED: [],
  WITHDRAWN: [],
  NO_RESPONSE: ['RECRUITER_SCREEN', 'ASSESSMENT', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
};

/** Statuses after submission (an application in one of these has been sent). */
export const SUBMITTED_STATUSES: readonly ApplicationStatus[] = APPLICATION_STATUSES.filter(
  (s) => s !== 'SAVED' && s !== 'PREPARING',
);

export const APPLICATION_DOCUMENT_TYPES = [
  'COVER_LETTER',
  'TAILORED_RESUME',
  'PORTFOLIO',
  'OTHER',
] as const;
export type ApplicationDocumentType = (typeof APPLICATION_DOCUMENT_TYPES)[number];

export const APPLICATION_DOCUMENT_TYPE_LABELS: Record<ApplicationDocumentType, string> = {
  COVER_LETTER: 'Cover letter',
  TAILORED_RESUME: 'Tailored resume',
  PORTFOLIO: 'Portfolio',
  OTHER: 'Other document',
};

/** Suggestions only; the source is free text. */
export const APPLICATION_SOURCE_SUGGESTIONS = [
  'LinkedIn',
  'Company website',
  'Referral',
  'Job board',
  'Recruiter',
  'Other',
] as const;

export const APPLICATION_SOURCE_MAX_LENGTH = 80;
export const APPLICATION_NOTE_MAX_LENGTH = 5000;
export const APPLICATION_REJECTION_REASON_MAX_LENGTH = 1000;
export const APPLICATION_DOCUMENT_NAME_MAX_LENGTH = 120;
export const APPLICATION_SEARCH_MAX_LENGTH = 100;

export const APPLICATION_SORTS = ['updated', 'created', 'applied', 'title'] as const;
export type ApplicationSort = (typeof APPLICATION_SORTS)[number];

// ─── Requests ────────────────────────────────────────────────────────────────

export interface CreateApplicationRequest {
  jobId: string;
  /** The exact resume version used; it never changes afterwards. */
  resumeVersionId: string;
  status?: InitialApplicationStatus;
  source?: string | null;
  applicationUrl?: string | null;
  /** YYYY-MM-DD; only with status APPLIED (defaults to today). */
  appliedAt?: string | null;
  /** Optional first note. */
  note?: string | null;
}

export interface UpdateApplicationRequest {
  source?: string | null;
  applicationUrl?: string | null;
  /** YYYY-MM-DD; correct the actual application date. Only once applied. */
  appliedAt?: string | null;
  rejectionReason?: string | null;
}

export interface ChangeApplicationStatusRequest {
  status: ApplicationStatus;
  note?: string | null;
  /** Only with status REJECTED. */
  rejectionReason?: string | null;
}

export interface ApplicationNoteRequest {
  body: string;
}

// ─── Responses ───────────────────────────────────────────────────────────────

/** The exact, immutable resume version attached to an application. */
export interface ApplicationResumeVersion {
  resumeId: string;
  resumeName: string;
  resumeVersionId: string;
  versionNumber: number;
  versionCreatedAt: string;
  hasFile: boolean;
  /** The resume has a newer current version than the one used here. */
  newerVersionExists: boolean;
}

export interface ApplicationSummary {
  id: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  status: ApplicationStatus;
  resume: Pick<
    ApplicationResumeVersion,
    'resumeId' | 'resumeName' | 'resumeVersionId' | 'versionNumber'
  >;
  source: string | null;
  /** YYYY-MM-DD */
  appliedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationStatusChange {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  changedAt: string;
  note: string | null;
}

export interface ApplicationNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationDocument {
  id: string;
  type: ApplicationDocumentType;
  name: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  applicationUrl: string | null;
  rejectionReason: string | null;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    jobUrl: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
  };
  resumeUsed: ApplicationResumeVersion;
  /** What the AI recommended for this job when the application was created (may differ). */
  recommendedAtCreation: {
    resumeVersionId: string | null;
    resumeName: string | null;
    versionNumber: number | null;
    score: number | null;
  } | null;
  /** Compatibility score of the resume used, from the job's analysis at creation time. */
  matchScoreAtCreation: number | null;
  /** Statuses the user may move to next. */
  allowedNextStatuses: ApplicationStatus[];
  importantDates: {
    createdAt: string;
    appliedAt: string | null;
    firstInterviewAt: string | null;
    offerAt: string | null;
    closedAt: string | null;
    lastUpdatedAt: string;
  };
}

export type ApplicationTimelineEvent =
  | {
      kind: 'CREATED';
      at: string;
      status: ApplicationStatus;
      resumeName: string;
      versionNumber: number;
    }
  | {
      kind: 'STATUS_CHANGED';
      at: string;
      fromStatus: ApplicationStatus | null;
      toStatus: ApplicationStatus;
      note: string | null;
    }
  | { kind: 'NOTE'; at: string; noteId: string; body: string; edited: boolean }
  | {
      kind: 'DOCUMENT_ADDED';
      at: string;
      documentId: string;
      name: string;
      type: ApplicationDocumentType;
    };

/** The active application for a job, shown on the job page. */
export interface JobApplicationLink {
  id: string;
  status: ApplicationStatus;
  resumeName: string;
  versionNumber: number;
}

export interface ApplicationPipeline {
  total: number;
  archived: number;
  byStatus: Record<ApplicationStatus, number>;
}
