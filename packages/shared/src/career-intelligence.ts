import type { ApplicationStatus, RejectionCategory } from './applications.js';
import type { GenerationSource } from './preparation.js';

// ─── Thresholds ──────────────────────────────────────────────────────────────
// Rates on tiny samples are misleading: below these sizes the API still returns the counts,
// but flags them as not reliable and never builds patterns or comparisons from them.

/** Submitted applications needed before outcome patterns are identified. */
export const CAREER_MIN_APPLICATIONS_FOR_PATTERNS = 10;
/** Applications a group (role, resume, source…) needs before its rates count as reliable. */
export const CAREER_MIN_GROUP_SIZE = 5;
/** Target jobs a skill must appear in before it is reported as frequently requested. */
export const CAREER_MIN_SKILL_JOBS = 3;

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/** Cumulative funnel: each stage counts applications that reached it or a later stage. */
export const FUNNEL_STAGES = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'FINAL_INTERVIEW',
  'OFFER',
  'ACCEPTED',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  SAVED: 'Tracked',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  FINAL_INTERVIEW: 'Final interview',
  OFFER: 'Offer',
  ACCEPTED: 'Accepted',
};

/** Match-score ranges used for outcome analysis (inclusive). */
export const MATCH_SCORE_BUCKETS = [
  { key: '0-49', min: 0, max: 49 },
  { key: '50-64', min: 50, max: 64 },
  { key: '65-79', min: 65, max: 79 },
  { key: '80-89', min: 80, max: 89 },
  { key: '90-100', min: 90, max: 100 },
] as const;

export const BREAKDOWN_DIMENSIONS = [
  'period',
  'source',
  'role',
  'company',
  'location',
  'workMode',
  'seniority',
  'skill',
  'weekday',
] as const;
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number];

export const CAREER_INSIGHT_CATEGORIES = [
  'STRENGTH',
  'WEAKNESS',
  'OPPORTUNITY',
  'RISK',
  'RECOMMENDATION',
  'SKILL_PRIORITY',
  'RESUME_RECOMMENDATION',
  'TARGETING_RECOMMENDATION',
  'INTERVIEW_PREPARATION',
] as const;
export type CareerInsightCategory = (typeof CAREER_INSIGHT_CATEGORIES)[number];

export const CAREER_INSIGHT_CATEGORY_LABELS: Record<CareerInsightCategory, string> = {
  STRENGTH: 'Strength',
  WEAKNESS: 'Weakness',
  OPPORTUNITY: 'Opportunity',
  RISK: 'Risk',
  RECOMMENDATION: 'Recommendation',
  SKILL_PRIORITY: 'Skill priority',
  RESUME_RECOMMENDATION: 'Resume',
  TARGETING_RECOMMENDATION: 'Targeting',
  INTERVIEW_PREPARATION: 'Interview preparation',
};

export const INSIGHT_CONFIDENCES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type InsightConfidence = (typeof INSIGHT_CONFIDENCES)[number];

export const CAREER_INSIGHT_RUN_STATUSES = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type CareerInsightRunStatus = (typeof CAREER_INSIGHT_RUN_STATUSES)[number];

/** Skill coverage across the best-matching resume of each target job. */
export const SKILL_COVERAGE_LEVELS = ['STRONG', 'PARTIAL', 'LIMITED'] as const;
export type SkillCoverageLevel = (typeof SKILL_COVERAGE_LEVELS)[number];

// ─── Metrics ─────────────────────────────────────────────────────────────────

/**
 * Outcomes for a set of submitted applications. Rates are 0–1 and null when the denominator
 * is zero; `reliable` is false below CAREER_MIN_GROUP_SIZE applications.
 */
export interface OutcomeMetrics {
  applications: number;
  /** Heard back: reached screening or later, or was rejected. */
  responses: number;
  /** Reached any interview stage (or an offer). */
  interviews: number;
  offers: number;
  accepted: number;
  rejections: number;
  responseRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  /** Offers / interviews. */
  interviewToOfferRate: number | null;
  reliable: boolean;
}

export interface BreakdownRow extends OutcomeMetrics {
  key: string;
  label: string;
}

export interface FunnelStageMetric {
  stage: FunnelStage;
  label: string;
  count: number;
  /** count / previous stage's count (null for the first stage or a zero denominator). */
  conversionFromPrevious: number | null;
}

export interface CareerTotals {
  /** Every tracked application, including ones not yet submitted. */
  tracked: number;
  /** Submitted (applied) applications — the denominator for outcome rates. */
  submitted: number;
  /** Saved/preparing, not yet submitted. */
  notSubmitted: number;
  /** Submitted and still in progress (no final outcome yet). */
  inProgress: number;
  /** Jobs the user is targeting that have a completed analysis. */
  analysedTargetJobs: number;
  outcomes: OutcomeMetrics;
}

export interface CareerFunnel {
  stages: FunnelStageMetric[];
  /** Applications that ever entered each status (from the append-only history). */
  everReached: Record<ApplicationStatus, number>;
  /** Applications currently in each status. */
  current: Record<ApplicationStatus, number>;
  rejectionCategories: { category: RejectionCategory | 'NOT_RECORDED'; count: number }[];
}

export interface ResumeVersionPerformance extends OutcomeMetrics {
  resumeId: string;
  resumeName: string;
  resumeVersionId: string;
  versionNumber: number;
  /** The version is its resume's current version and the resume is active. */
  isCurrent: boolean;
  resumeArchived: boolean;
  /** Distinct jobs this exact version has been compared with. */
  jobsMatched: number;
  /** Average compatibility score across those comparisons; null if none. */
  averageMatchScore: number | null;
}

export interface MatchScoreBucketRow extends OutcomeMetrics {
  key: string;
  min: number;
  max: number;
}

export interface MatchScorePerformance {
  buckets: MatchScoreBucketRow[];
  /** Submitted applications without a stored match score (e.g. created before analysis). */
  unscored: number;
  /** Share of scored submitted applications at 65 or above; null with none scored. */
  alignedShare: number | null;
}

export interface SkillIntelligenceRow {
  skill: string;
  /** Analysed target jobs listing the skill. */
  jobs: number;
  requiredIn: number;
  /** Best-matching resume per job: how often it showed the skill. */
  coverage: { matched: number; partial: number; missing: number };
  coverageLevel: SkillCoverageLevel;
  /** Submitted applications whose job required the skill (at application time). */
  outcomes: OutcomeMetrics;
  /** Appears often and resumes show limited evidence for it. */
  isGap: boolean;
}

export interface InterviewTopicRow {
  topic: string;
  /** 0–100 practice score average across completed sessions (practice feedback, not a measurement). */
  averageScore: number;
  sessions: number;
}

export const CAREER_PATTERN_KINDS = [
  'STRONGEST_ROLE',
  'STRONGEST_RESUME',
  'STRONGEST_SOURCE',
  'STRONGEST_LOCATION',
  'STRONGEST_WORK_MODE',
  'MATCH_ALIGNMENT',
  'MATCH_OUTCOME_TREND',
  'FREQUENT_SKILLS',
  'RECURRING_GAPS',
  'APPLICATION_TIMING',
  'INTERVIEW_TOPICS',
  'REJECTION_CATEGORIES',
] as const;
export type CareerPatternKind = (typeof CAREER_PATTERN_KINDS)[number];

/** A deterministic finding, stated as a fact with its sample size. */
export interface CareerPattern {
  kind: CareerPatternKind;
  title: string;
  /** Factual statement computed from stored data. */
  finding: string;
  sampleSize: number;
  confidence: InsightConfidence;
}

export interface DataLimitations {
  submitted: number;
  minimumForPatterns: number;
  minimumGroupSize: number;
  sufficientForPatterns: boolean;
  messages: string[];
}

/** GET /career-intelligence/overview — everything the dashboard needs, computed from stored data. */
export interface CareerIntelligenceReport {
  totals: CareerTotals;
  funnel: CareerFunnel;
  breakdowns: Record<BreakdownDimension, BreakdownRow[]>;
  resumes: ResumeVersionPerformance[];
  matchScores: MatchScorePerformance;
  skills: SkillIntelligenceRow[];
  interviewTopics: InterviewTopicRow[];
  patterns: CareerPattern[];
  limitations: DataLimitations;
  calculatedAt: string;
}

// ─── Insights ────────────────────────────────────────────────────────────────

export interface InsightEvidence {
  factId: string;
  /** Computed statement (never AI-written). */
  statement: string;
  sampleSize: number | null;
}

export interface CareerInsightItem {
  id: string;
  category: CareerInsightCategory;
  title: string;
  explanation: string;
  evidence: InsightEvidence[];
  confidence: InsightConfidence;
  recommendedAction: string;
  source: GenerationSource;
  generatedAt: string;
}

export interface CareerInsightsResponse {
  /** The latest run (any status); null if insights were never generated. */
  run: {
    id: string;
    status: CareerInsightRunStatus;
    source: GenerationSource | null;
    note: string | null;
    error: string | null;
    generatedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
  } | null;
  /** Insights of the latest completed run. */
  insights: CareerInsightItem[];
  /** The data changed (or the insights expired) since they were generated. */
  stale: boolean;
  /** A generation is queued or running. */
  generating: boolean;
  aiEnabled: boolean;
  /** Shown with every insight: compatibility and patterns, never predictions. */
  disclaimer: string;
}

export const CAREER_INSIGHTS_DISCLAIMER =
  'Insights describe patterns in your own recorded data. They are not predictions, and small samples can change quickly.';
