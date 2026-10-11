/** Resume library contract. See docs/DATABASE.md § Resume library. */

export const RESUME_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ResumeStatus = (typeof RESUME_STATUSES)[number];

export const RESUME_VERSION_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ResumeVersionStatus = (typeof RESUME_VERSION_STATUSES)[number];

export const RESUME_VERSION_SOURCES = ['UPLOAD', 'MANUAL_EDIT', 'DUPLICATE', 'PROFILE'] as const;
export type ResumeVersionSource = (typeof RESUME_VERSION_SOURCES)[number];
export const RESUME_VERSION_SOURCE_LABELS: Record<ResumeVersionSource, string> = {
  UPLOAD: 'Uploaded file',
  MANUAL_EDIT: 'Edited',
  DUPLICATE: 'Duplicated',
  PROFILE: 'Created from profile',
};

/**
 * NOT_APPLICABLE: no file to parse (edited / created from profile).
 * NEEDS_REVIEW: extracted successfully, waiting for the user to confirm.
 * COMPLETED: extracted and confirmed by the user.
 */
export const PARSE_STATUSES = [
  'NOT_APPLICABLE',
  'PENDING',
  'PROCESSING',
  'NEEDS_REVIEW',
  'COMPLETED',
  'FAILED',
] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const RESUME_ACCEPTED_EXTENSIONS = ['.pdf', '.docx'] as const;
export const RESUME_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const RESUME_DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const RESUME_NAME_MAX_LENGTH = 120;
export const RESUME_CATEGORY_MAX_LENGTH = 60;
export const RESUME_TAG_MAX_LENGTH = 40;
export const RESUME_MAX_TAGS = 20;

/** Library ordering. The default resume is always listed first. */
export const RESUME_SORTS = ['updated', 'created', 'name'] as const;
export type ResumeSort = (typeof RESUME_SORTS)[number];
export const RESUME_SEARCH_MAX_LENGTH = 100;

// ─── Structured resume content ────────────────────────────────────────────────

export interface ResumeContactInfo {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
}

export interface ResumeExperienceEntry {
  company: string | null;
  jobTitle: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  /** Original lines as they appeared in the resume. */
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
}

export interface ResumeEducationEntry {
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  grade: string | null;
}

export interface ResumeProjectEntry {
  name: string | null;
  description: string | null;
  technologies: string[];
  highlights: string[];
  url: string | null;
}

export interface ResumeCertificationEntry {
  name: string;
  issuer: string | null;
  date: string | null;
}

export interface ResumeSkillEntry {
  name: string;
  category: import('./profile.js').SkillCategory;
}

/**
 * Structured content of one resume version. The same shape is used for
 * parser output (`parsed`), optional AI structuring (`ai`) and the user-confirmed
 * content — so the three can be shown side by side.
 */
export interface ResumeContent {
  contact: ResumeContactInfo;
  /** One-line professional headline as written in the resume (e.g. under the name). */
  headline: string | null;
  summary: string | null;
  skills: ResumeSkillEntry[];
  experiences: ResumeExperienceEntry[];
  educations: ResumeEducationEntry[];
  projects: ResumeProjectEntry[];
  certifications: ResumeCertificationEntry[];
  achievements: string[];
  /** Spoken/written languages as listed in the resume. */
  languages: string[];
  /** Total professional experience computed from experience date ranges (parser estimate). */
  estimatedYearsOfExperience: number | null;
}

export interface ResumeFileInfo {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ResumeVersionSummary {
  id: string;
  versionNumber: number;
  status: ResumeVersionStatus;
  source: ResumeVersionSource;
  parseStatus: ParseStatus;
  hasFile: boolean;
  notes: string | null;
  parentVersionId: string | null;
  /** True when an AI interpretation passed validation and is available for review. */
  hasAiExtraction: boolean;
  /** When the user confirmed the structured content; null while unreviewed. */
  contentConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
}

export interface ResumeVersionDetail extends ResumeVersionSummary {
  file: ResumeFileInfo | null;
  parseError: string | null;
  parsedAt: string | null;
  /** User-confirmed content (highest authority). Null until reviewed. */
  content: ResumeContent | null;
}

export interface ResumeSummary {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  status: ResumeStatus;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versionCount: number;
  currentVersion: ResumeVersionSummary | null;
  /** Newest version (may be a draft awaiting review). */
  latestVersion: ResumeVersionSummary | null;
}

export interface ResumeDetail extends ResumeSummary {
  versions: ResumeVersionSummary[];
}

/** The three extraction layers of a version, kept separate for provenance. */
export interface ResumeExtractedData {
  versionId: string;
  versionNumber: number;
  versionStatus: ResumeVersionStatus;
  parseStatus: ParseStatus;
  parseError: string | null;
  parserVersion: string | null;
  /** Raw text extracted from the original file. */
  extractedText: string | null;
  /** Deterministic parser output — a suggestion, not truth. */
  parsed: ResumeContent | null;
  /** Optional AI structuring output (validated) — a suggestion, not truth. */
  ai: ResumeContent | null;
  /** DISABLED: no AI provider; VALID: AI output available; INVALID/FAILED: AI attempted, nothing kept. */
  aiStatus: 'DISABLED' | 'VALID' | 'INVALID' | 'FAILED';
  aiNote: string | null;
  /** What the user reviewed and confirmed. */
  confirmed: ResumeContent | null;
  /** True when the version is a DRAFT and its content can still be edited. */
  editable: boolean;
}

export interface ParseStatusResponse {
  /** The version the status refers to (for resume-level endpoints: the working version). */
  versionId: string;
  versionNumber: number;
  parseStatus: ParseStatus;
  parseError: string | null;
  parsedAt: string | null;
}

export interface UpdateResumeRequest {
  name?: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}

export interface CreateVersionRequest {
  /** Version to copy content from. Defaults to the current version. */
  baseVersionId?: string;
  notes?: string;
}

export interface DuplicateResumeRequest {
  name?: string;
}

export interface CreateResumeFromProfileRequest {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface DashboardSummary {
  resumes: {
    total: number;
    active: number;
    archived: number;
    defaultResume: { id: string; name: string } | null;
    /** Resumes whose newest version was extracted but not yet reviewed. */
    needsReview: number;
    latestUpload: { id: string; name: string; uploadedAt: string } | null;
    /** Active resume changed most recently (rename, new version, review…). */
    recentlyUpdated: { id: string; name: string; updatedAt: string } | null;
  };
  profileCompletion: import('./profile.js').ProfileCompletion;
  /** Real counts of the user's tracked applications. */
  applications: import('./applications.js').ApplicationPipeline;
  /** New job recommendations from the user's alerts, by match level. */
  recommendations: import('./discovery.js').RecommendationOverview;
}
