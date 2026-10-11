import type { JobApplicationLink } from './applications.js';
import type { EmploymentType } from './profile.js';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export const JOB_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_ORIGINS = ['MANUAL', 'DISCOVERED'] as const;
export type JobOrigin = (typeof JOB_ORIGINS)[number];

export const JOB_ANALYSIS_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type JobAnalysisStatus = (typeof JOB_ANALYSIS_STATUSES)[number];

export const JOB_REQUIREMENT_TYPES = [
  'SKILL',
  'EXPERIENCE',
  'EDUCATION',
  'RESPONSIBILITY',
  /** Any other stated requirement, e.g. "Experience building SaaS applications". */
  'OTHER',
] as const;
export type JobRequirementType = (typeof JOB_REQUIREMENT_TYPES)[number];

export const JOB_REQUIREMENT_IMPORTANCE = ['REQUIRED', 'PREFERRED'] as const;
export type JobRequirementImportance = (typeof JOB_REQUIREMENT_IMPORTANCE)[number];

/**
 * EXPLICIT: the posting states it under a requirements / nice-to-have heading or with
 * wording like "must" / "required". INFERRED: mentioned elsewhere, importance assumed.
 */
export const JOB_REQUIREMENT_ORIGINS = ['EXPLICIT', 'INFERRED'] as const;
export type JobRequirementOrigin = (typeof JOB_REQUIREMENT_ORIGINS)[number];

/** Which layer found the requirement: the rule-based analyser or the (grounded) AI. */
export const JOB_REQUIREMENT_DETECTORS = ['PARSER', 'AI'] as const;
export type JobRequirementDetector = (typeof JOB_REQUIREMENT_DETECTORS)[number];

export const SENIORITY_LEVELS = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'PRINCIPAL'] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  INTERN: 'Intern',
  JUNIOR: 'Junior',
  MID: 'Mid-level',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  PRINCIPAL: 'Principal / Staff',
};

export const JOB_TITLE_MAX_LENGTH = 200;
export const JOB_COMPANY_MAX_LENGTH = 200;
export const JOB_DESCRIPTION_MIN_LENGTH = 80;
export const JOB_DESCRIPTION_MAX_LENGTH = 30_000;
export const JOB_SOURCE_MAX_LENGTH = 80;
export const JOB_LOCATION_MAX_LENGTH = 150;
export const JOB_SEARCH_MAX_LENGTH = 100;

export const JOB_SORTS = ['created', 'updated', 'match', 'title'] as const;
export type JobSort = (typeof JOB_SORTS)[number];

// ─── Scoring vocabulary ──────────────────────────────────────────────────────

export const MATCH_DIMENSIONS = [
  'skills',
  'experience',
  'responsibilities',
  'projects',
  'education',
  'keywords',
] as const;
export type MatchDimension = (typeof MATCH_DIMENSIONS)[number];

export const MATCH_DIMENSION_LABELS: Record<MatchDimension, string> = {
  skills: 'Skills',
  experience: 'Experience',
  responsibilities: 'Responsibilities',
  projects: 'Projects',
  education: 'Education',
  keywords: 'Keywords',
};

export const MATCH_LEVELS = ['LOW', 'MODERATE', 'STRONG', 'EXCELLENT'] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

/** Lower bound (inclusive) of each level, highest first. */
export const MATCH_LEVEL_THRESHOLDS: [MatchLevel, number][] = [
  ['EXCELLENT', 85],
  ['STRONG', 70],
  ['MODERATE', 50],
  ['LOW', 0],
];

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
  LOW: 'Low match',
  MODERATE: 'Moderate match',
  STRONG: 'Strong match',
  EXCELLENT: 'Excellent match',
};

export function matchLevel(score: number): MatchLevel {
  return MATCH_LEVEL_THRESHOLDS.find(([, min]) => score >= min)?.[0] ?? 'LOW';
}

/** The only wording the product uses for the score. Never "hiring probability" or "ATS score". */
export const MATCH_SCORE_NAME = 'AI-assisted job compatibility score';

export const SKILL_MATCH_STATUSES = ['MATCH', 'PARTIAL', 'MISSING'] as const;
export type SkillMatchStatus = (typeof SKILL_MATCH_STATUSES)[number];

/** Where in the resume/profile the evidence was found. */
export const EVIDENCE_LOCATIONS = [
  'EXPERIENCE',
  'SKILLS',
  'PROJECTS',
  'CERTIFICATIONS',
  'SUMMARY',
  'RELATED_SKILL',
] as const;
export type EvidenceLocation = (typeof EVIDENCE_LOCATIONS)[number];

export type MatchSubjectType = 'RESUME_VERSION' | 'PROFILE';

// ─── Requests ────────────────────────────────────────────────────────────────

export interface CreateJobRequest {
  title: string;
  companyName: string;
  description: string;
  jobUrl?: string | null;
  location?: string | null;
  employmentType?: EmploymentType | null;
  source?: string | null;
}

export type UpdateJobRequest = Partial<CreateJobRequest>;

export interface SelectResumeRequest {
  resumeVersionId: string;
}

// ─── Responses ───────────────────────────────────────────────────────────────

export interface JobRequirementItem {
  id: string;
  type: JobRequirementType;
  /** As written (skills are shown by their canonical name, e.g. "React"). */
  name: string;
  normalizedName: string;
  importance: JobRequirementImportance;
  origin: JobRequirementOrigin;
  detectedBy: JobRequirementDetector;
  /** Verbatim excerpt of the job description supporting this requirement. */
  evidence: string | null;
  /** For EXPERIENCE requirements that state a number of years. */
  minYears: number | null;
}

export interface JobAnalysisResult {
  id: string;
  jobId: string;
  status: JobAnalysisStatus;
  /** Safe, user-facing reason when FAILED. */
  error: string | null;
  analyzerVersion: string;
  /** Opening of the posting, quoted verbatim (EXTERNAL_SOURCE). */
  summary: string | null;
  /** Summary written by the AI (AI_INFERENCE); null when AI was not used. */
  aiSummary: string | null;
  seniority: SeniorityLevel | null;
  /** STATED when the title/description names the level; INFERRED from required years. */
  seniorityOrigin: 'STATED' | 'INFERRED' | null;
  employmentType: EmploymentType | null;
  keywords: string[];
  /** 0–1: how much structure the analyser could find. Not a quality judgement of the job. */
  confidence: number | null;
  aiStatus: 'DISABLED' | 'VALID' | 'INVALID' | 'FAILED';
  aiNote: string | null;
  aiProvider: string | null;
  requirements: JobRequirementItem[];
  /** True when the job description changed after this analysis ran. */
  outdated: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface SkillEvidence {
  skill: string;
  normalizedName: string;
  importance: JobRequirementImportance;
  status: SkillMatchStatus;
  /** Credit given towards the skills score, 0–1. */
  credit: number;
  location: EvidenceLocation | null;
  /** Human-readable explanation that cites the stored resume/profile data. */
  evidence: string;
}

export interface ResponsibilityEvidence {
  responsibility: string;
  status: SkillMatchStatus;
  /** Verbatim resume/profile line that covers it, when found. */
  matchedLine: string | null;
}

export interface ProjectEvidence {
  project: string;
  matchedSkills: string[];
}

export interface MatchEvidence {
  skills: SkillEvidence[];
  experience: {
    requiredYears: number | null;
    candidateYears: number | null;
    yearsSource: string | null;
    relevantTitles: string[];
    notes: string[];
  };
  responsibilities: ResponsibilityEvidence[];
  projects: ProjectEvidence[];
  education: {
    requirement: string | null;
    candidateHighest: string | null;
    met: boolean | null;
    notes: string[];
  };
  keywords: { matched: string[]; missing: string[] };
}

export type MatchDimensionScores = Record<MatchDimension, number | null>;

export interface MatchAnalysisItem {
  id: string;
  subjectType: MatchSubjectType;
  resumeId: string | null;
  resumeVersionId: string | null;
  /** Snapshot taken when the match was computed, so history stays readable. */
  resumeName: string | null;
  versionNumber: number | null;
  isDefaultResume: boolean;
  overallScore: number;
  level: MatchLevel;
  /** 0–100 per dimension; null when the job states nothing for that dimension. */
  scores: MatchDimensionScores;
  strengths: string[];
  gaps: string[];
  evidence: MatchEvidence;
  /** Rank among resumes for this analysis (1 = best); null for the profile. */
  rank: number | null;
  createdAt: string;
}

export interface ExcludedResume {
  resumeId: string;
  resumeName: string;
  reason: string;
}

export interface JobMatchesResponse {
  analysisId: string;
  weights: Record<MatchDimension, number>;
  profile: MatchAnalysisItem | null;
  /** Ranked best first. */
  resumes: MatchAnalysisItem[];
  /** Active resumes that could not be compared, with the reason. */
  excluded: ExcludedResume[];
  /** True when the user's active resumes changed after this analysis (re-analyse to refresh). */
  stale: boolean;
}

export interface ResumeRecommendationItem {
  id: string;
  analysisId: string;
  matchAnalysisId: string;
  resumeId: string | null;
  resumeVersionId: string | null;
  resumeName: string | null;
  versionNumber: number | null;
  score: number;
  level: MatchLevel;
  reasons: string[];
  gaps: string[];
  generatedAt: string;
}

export interface SelectedResume {
  resumeId: string;
  resumeVersionId: string;
  resumeName: string;
  versionNumber: number;
  selectedAt: string;
  /** Whether the user picked the recommended resume. */
  isRecommended: boolean;
}

export interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  employmentType: EmploymentType | null;
  source: string | null;
  jobUrl: string | null;
  status: JobStatus;
  /** DISCOVERED jobs were found by a job alert. */
  origin: JobOrigin;
  /** Development fixture posting: never a real listing. */
  isSampleData: boolean;
  /** False for discovered jobs the user hasn't saved yet (kept out of the Jobs list). */
  inLibrary: boolean;
  createdAt: string;
  updatedAt: string;
  /** Status of the latest analysis run; null if never analysed. */
  analysisStatus: JobAnalysisStatus | null;
  bestMatch: { score: number; level: MatchLevel; resumeName: string | null } | null;
  selectedResumeName: string | null;
}

export interface JobDetail extends JobSummary {
  description: string;
  archivedAt: string | null;
  /** The completed analysis whose results are shown; null until one completes. */
  currentAnalysisId: string | null;
  /** The latest analysis run (any status). */
  latestAnalysis: Pick<
    JobAnalysisResult,
    'id' | 'status' | 'error' | 'createdAt' | 'completedAt' | 'outdated'
  > | null;
  recommendation: ResumeRecommendationItem | null;
  selectedResume: SelectedResume | null;
  /** The job's active (non-archived) application, if one is being tracked. */
  application: JobApplicationLink | null;
}

export interface JobRecommendationResponse {
  recommendation: ResumeRecommendationItem | null;
  /** Why there is no recommendation (e.g. no reviewed active resumes). */
  reason: string | null;
}
