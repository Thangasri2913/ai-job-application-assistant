import type {
  AnalysedJobRef,
  CourseDetail,
  InterviewPracticeQuestion,
  JobReadinessResponse,
  LearningAnalytics,
  LearningPreferences,
  LearningRecommendationResponse,
  LearningRole,
  MentorAskRequest,
  MentorFallbackReason,
  MentorResponse,
  MentorTool,
  NextStepsResponse,
  ProjectChallengeSummary,
  ReadinessOverview,
  RevisionQueueResponse,
  SkillAssessment,
} from '@job-assist/shared';
import type { z } from 'zod';

/**
 * Trusted context supplied by the host API from the authenticated request. The agent passes
 * `userId` to every user-specific tool; it never comes from the request body or the model.
 */
export interface AgentContext {
  userId: string;
}

// ── Tool results (shared JobAssist types only) ──

export interface CatalogueSkill {
  id: string;
  name: string;
  alsoKnownAs: string[];
}

export interface CatalogueSnapshot {
  /** Published courses only. */
  courses: CourseDetail[];
  skills: CatalogueSkill[];
  /** Curated core skill ids per role. */
  roleCoreSkills: Partial<Record<LearningRole, string[]>>;
  /** The published course that teaches each skill most directly (computed by the host). */
  bestCourseBySkill: Record<string, string>;
}

export interface LearningSnapshot {
  nextSteps: NextStepsResponse;
  revision: RevisionQueueResponse;
  analytics: LearningAnalytics;
  enrolledCourseIds: string[];
  /** Latest assessment evidence per skill (counts only). */
  skillEvidence: { skillId: string; correct: number; total: number }[];
}

export interface SkillAssessmentResult {
  skills: SkillAssessment[];
  hasResume: boolean;
}

export interface LearningPlanResult {
  role: LearningRole;
  plan: LearningRecommendationResponse;
}

export interface InterviewPracticeResult {
  questions: InterviewPracticeQuestion[];
  overview: ReadinessOverview['interview'];
}

/**
 * Read-only lookups the host implements by wrapping its existing services. Every method that
 * takes a userId must scope its results to that user (the host's existing ownership checks).
 * There is deliberately no generic query method.
 */
export interface MentorToolPort {
  catalogue(): CatalogueSnapshot | Promise<CatalogueSnapshot>;
  preferences(userId: string): Promise<LearningPreferences>;
  learningSnapshot(userId: string): Promise<LearningSnapshot>;
  skillAssessment(
    userId: string,
    target: { role: LearningRole } | { skillIds: string[] },
  ): Promise<SkillAssessmentResult>;
  learningPlan(userId: string, role: LearningRole): Promise<LearningPlanResult>;
  interviewPractice(userId: string): Promise<InterviewPracticeResult>;
  projectChallenges(userId: string): Promise<ProjectChallengeSummary[]>;
  analysedJobs(userId: string): Promise<AnalysedJobRef[]>;
  /** Readiness for one of the user's jobs; must reject jobs the user does not own. */
  jobReadiness(userId: string, jobId: string): Promise<JobReadinessResponse>;
}

/**
 * The structured-generation port. The host passes its existing AI service (JobAssist's
 * `AiService` matches this shape). `enabled` false means AI is off: the agent answers by rules.
 */
export interface MentorModel {
  readonly enabled: boolean;
  generateStructured<T>(request: {
    task: string;
    system: string;
    input: string;
    schema: z.ZodType<T>;
    /**
     * Aborted when the agent's deadline passes. Implementations should cancel the underlying
     * request (JobAssist's AiService passes it to the provider SDK); the agent stops waiting
     * either way.
     */
    signal?: AbortSignal;
  }): Promise<T>;
}

export interface AgentOptions {
  /** Total time allowed for AI composition (default 30 s). */
  timeoutMs?: number;
  /** Model calls per request, including one corrective retry (default 2). */
  maxModelAttempts?: number;
}

export interface AgentDependencies {
  tools: MentorToolPort;
  /** Omit, or pass a disabled model, to answer by rules only. */
  model?: MentorModel;
  /**
   * Set by the host when this user's AI allowance is used up (or another AI answer of theirs is
   * in progress). The model is then not called and the rules answer is returned with this reason.
   */
  aiBlockedReason?: 'AI_LIMIT_REACHED';
  options?: AgentOptions;
}

/** Counts for the host's logs and usage records. Never contains user content. */
export interface AgentTelemetry {
  toolsUsed: MentorTool[];
  modelAttempts: number;
  /** For the host's AI usage record; null when the model was not called. */
  modelOutcome: 'SUCCEEDED' | 'INVALID' | 'FAILED' | null;
  fallbackReason: MentorFallbackReason | null;
  /** Problems found in rejected AI drafts (counts, not content). */
  rejectedDraftProblems: number;
  droppedRecommendations: number;
}

export interface AgentResult {
  response: MentorResponse;
  telemetry: AgentTelemetry;
}

export type { MentorAskRequest };
