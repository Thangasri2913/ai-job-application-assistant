// ─── Learn & Prepare (ADR-0021, ADR-0022) ───────────────────────────────────
//
// A catalogue of courses: ordered modules → ordered lessons with interactive activities,
// hands-on exercises, projects and curated external resources. Every piece of content says
// where it came from (provenance) and whether a person reviewed it. Progress, assessment
// results and demonstrated-skill evidence are stored separately per user.

/** Stable identifiers: lowercase words separated by hyphens. */
export const LEARNING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Taxonomy ───────────────────────────────────────────────────────────────

export const LEARNING_CATEGORIES = [
  'SOFTWARE_DEVELOPMENT',
  'DATA',
  'AI_AND_MACHINE_LEARNING',
  'CLOUD_AND_DEVOPS',
  'CYBERSECURITY',
  'QUALITY_ASSURANCE',
  'DESIGN',
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

export const LEARNING_CATEGORY_LABELS: Record<LearningCategory, string> = {
  SOFTWARE_DEVELOPMENT: 'Software development',
  DATA: 'Data and analytics',
  AI_AND_MACHINE_LEARNING: 'AI and machine learning',
  CLOUD_AND_DEVOPS: 'Cloud and DevOps',
  CYBERSECURITY: 'Cybersecurity',
  QUALITY_ASSURANCE: 'Quality assurance',
  DESIGN: 'UI/UX design',
};

export const LEARNING_ROLES = [
  'FRONTEND_DEVELOPER',
  'BACKEND_DEVELOPER',
  'FULL_STACK_DEVELOPER',
  'QA_TESTER',
  'DATA_ANALYST',
  'DATA_ENGINEER',
  'AI_APPLICATION_DEVELOPER',
  'ML_ENGINEER',
  'CLOUD_DEVOPS_ENGINEER',
  'SECURITY_ANALYST',
  'UI_UX_DESIGNER',
] as const;
export type LearningRole = (typeof LEARNING_ROLES)[number];

export const LEARNING_ROLE_LABELS: Record<LearningRole, string> = {
  FRONTEND_DEVELOPER: 'Frontend Developer',
  BACKEND_DEVELOPER: 'Backend Developer',
  FULL_STACK_DEVELOPER: 'Full Stack Developer',
  QA_TESTER: 'QA / Software Tester',
  DATA_ANALYST: 'Data Analyst',
  DATA_ENGINEER: 'Data Engineer',
  AI_APPLICATION_DEVELOPER: 'AI Application Developer',
  ML_ENGINEER: 'Machine Learning Engineer',
  CLOUD_DEVOPS_ENGINEER: 'Cloud / DevOps Engineer',
  SECURITY_ANALYST: 'Security Analyst',
  UI_UX_DESIGNER: 'UI/UX Designer',
};

export const LEARNING_DIFFICULTIES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export type LearningDifficulty = (typeof LEARNING_DIFFICULTIES)[number];

export const LEARNING_DIFFICULTY_LABELS: Record<LearningDifficulty, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};

/** PUBLISHED: curriculum available. PLANNED: announced, curriculum not written yet. */
export const COURSE_STATUSES = ['PUBLISHED', 'PLANNED'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

/** CAREER_TRACK: a whole role end to end. SKILL_COURSE: one skill in depth. */
export const COURSE_FORMATS = ['CAREER_TRACK', 'SKILL_COURSE'] as const;
export type CourseFormat = (typeof COURSE_FORMATS)[number];

export const COURSE_FORMAT_LABELS: Record<CourseFormat, string> = {
  CAREER_TRACK: 'Career track',
  SKILL_COURSE: 'Skill course',
};

/**
 * Skill progression. Level 0 is the diagnostic; lessons sit at levels 1–6. Completing a
 * lesson at a level is not proof of mastery — only assessments produce skill evidence.
 */
export const SKILL_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  0: 'Diagnostic',
  1: 'Fundamentals',
  2: 'Core concepts',
  3: 'Independent practice',
  4: 'Intermediate application',
  5: 'Advanced design decisions',
  6: 'Real-world project',
};

/** Where a module sits in the practical progression of a course. */
export const LEARNING_MODULE_KINDS = [
  'FOUNDATIONS',
  'CORE_CONCEPTS',
  'HANDS_ON',
  'INTEGRATION',
  'TESTING',
  'ADVANCED',
  'PORTFOLIO_PROJECT',
  'INTERVIEW_PREPARATION',
] as const;
export type LearningModuleKind = (typeof LEARNING_MODULE_KINDS)[number];

export const LEARNING_MODULE_KIND_LABELS: Record<LearningModuleKind, string> = {
  FOUNDATIONS: 'Foundations',
  CORE_CONCEPTS: 'Core concepts',
  HANDS_ON: 'Hands-on practice',
  INTEGRATION: 'Integration',
  TESTING: 'Testing',
  ADVANCED: 'Advanced topics',
  PORTFOLIO_PROJECT: 'Portfolio project',
  INTERVIEW_PREPARATION: 'Interview preparation',
};

// ─── Provenance ─────────────────────────────────────────────────────────────

/**
 * JobAssist's own content (explanations, activities, exercises, projects). `origin` says who
 * wrote it; `review` says whether a person checked it — REVIEWED only when that really
 * happened, with who and when. External material is an ExternalResource, never copied.
 */
export type ContentProvenance = {
  origin: 'ORIGINAL' | 'AI_GENERATED';
  review: { status: 'UNREVIEWED' } | { status: 'REVIEWED'; reviewedBy: string; reviewedAt: string };
};

export const CONTENT_ORIGIN_LABELS: Record<ContentProvenance['origin'], string> = {
  ORIGINAL: 'Original JobAssist content',
  AI_GENERATED: 'AI-generated',
};

export const EXTERNAL_RESOURCE_TYPES = [
  'DOCUMENTATION',
  'TUTORIAL',
  'COURSE',
  'BOOK',
  'REFERENCE',
] as const;
export type ExternalResourceType = (typeof EXTERNAL_RESOURCE_TYPES)[number];

export const EXTERNAL_RESOURCE_TYPE_LABELS: Record<ExternalResourceType, string> = {
  DOCUMENTATION: 'Documentation',
  TUTORIAL: 'Tutorial',
  COURSE: 'Course',
  BOOK: 'Book',
  REFERENCE: 'Reference',
};

/**
 * A link to someone else's material (never copied). Curated = chosen from the provider's own
 * site. `linkCheck` records only whether the URL answered; it says nothing about the content.
 */
export interface ExternalResource {
  id: string;
  title: string;
  provider: string;
  url: string;
  type: ExternalResourceType;
  provenance: 'CURATED';
  /** Skills (ids) this resource helps with. */
  skillIds: string[];
  linkCheck:
    { status: 'NOT_CHECKED' } | { status: 'REACHABLE'; checkedOn: string; httpStatus: number };
}

// ─── Interactive activities ─────────────────────────────────────────────────

export interface CodeSnippet {
  language: string;
  /** Plain text, shown as code. Never executed. */
  source: string;
}

export const MULTIPLE_CHOICE_VARIANTS = [
  'CONCEPT',
  'CODE_READING',
  'DEBUGGING',
  'SQL',
  'SCENARIO',
  'DESIGN',
] as const;
export type MultipleChoiceVariant = (typeof MULTIPLE_CHOICE_VARIANTS)[number];

export const ACTIVITY_VARIANT_LABELS: Record<MultipleChoiceVariant, string> = {
  CONCEPT: 'Knowledge check',
  CODE_READING: 'Code reading',
  DEBUGGING: 'Debugging',
  SQL: 'SQL query',
  SCENARIO: 'Scenario',
  DESIGN: 'Design decision',
};

interface ActivityBase {
  id: string;
  /** 1-based position in its lesson. */
  order: number;
  /** Plain-text question or task. */
  prompt: string;
  code: CodeSnippet | null;
  /** Shown on request, before answering. */
  hint: string | null;
  provenance: ContentProvenance;
}

/** Answers and per-option feedback are not part of the public shape: the server grades. */
export interface MultipleChoiceActivity extends ActivityBase {
  type: 'MULTIPLE_CHOICE';
  variant: MultipleChoiceVariant;
  options: { id: string; text: string }[];
}

export type GapSegment =
  { kind: 'text'; text: string } | { kind: 'gap'; id: string; label: string };

export interface FillInTheGapActivity extends ActivityBase {
  type: 'FILL_IN_THE_GAP';
  /** Render the segments as code (monospace) rather than prose. */
  asCode: boolean;
  segments: GapSegment[];
}

export interface ShortAnswerActivity extends ActivityBase {
  type: 'SHORT_ANSWER';
  variant: 'EXPECTED_OUTPUT' | 'CONCEPT' | 'SQL';
}

/** Self-reported practical checklist: recorded as done, never graded. */
export interface ChecklistActivity extends ActivityBase {
  type: 'CHECKLIST';
  items: { id: string; text: string }[];
}

/** A prompt to think or write about. Nothing the learner writes is sent or stored. */
export interface ReflectionActivity extends ActivityBase {
  type: 'REFLECTION';
}

export interface RevisionCardsActivity extends ActivityBase {
  type: 'REVISION_CARDS';
  cards: { front: string; back: string }[];
}

export type LearningActivity =
  | MultipleChoiceActivity
  | FillInTheGapActivity
  | ShortAnswerActivity
  | ChecklistActivity
  | ReflectionActivity
  | RevisionCardsActivity;

export type LearningActivityType = LearningActivity['type'];

/** Activities the server grades (answers kept server-side until submission). */
export const GRADED_ACTIVITY_TYPES = [
  'MULTIPLE_CHOICE',
  'FILL_IN_THE_GAP',
  'SHORT_ANSWER',
] as const;

export type ActivityAnswer =
  | { type: 'MULTIPLE_CHOICE'; optionId: string }
  | { type: 'FILL_IN_THE_GAP'; gaps: Record<string, string> }
  | { type: 'SHORT_ANSWER'; text: string }
  | { type: 'CHECKLIST'; checkedItemIds: string[] };

export interface SubmitActivityAttemptRequest {
  answer: ActivityAnswer;
}

export interface ActivityAttemptResult {
  activityId: string;
  /** False for self-reported checklists. */
  graded: boolean;
  correct: boolean | null;
  /** 0–1 for graded activities. */
  score: number | null;
  /** Why this answer is right or wrong. */
  feedback: string;
  /** The general explanation of the correct answer. */
  explanation: string;
  /** Display text of the correct answer (graded activities only). */
  correctAnswer: string | null;
  gapResults: { gapId: string; correct: boolean; expected: string }[] | null;
  attemptNumber: number;
  recordedAt: string;
}

// ─── Curriculum ─────────────────────────────────────────────────────────────

export interface PracticeExercise {
  id: string;
  title: string;
  instructions: string;
  /** What a good answer demonstrates, so learners can check themselves. */
  successCriteria: string[];
  estimatedMinutes: number;
  provenance: ContentProvenance;
}

export interface LessonExample {
  title: string;
  /** Plain text (rendered as text, never as HTML). */
  description: string;
  code: CodeSnippet | null;
  /** What running the code would print — authored, never produced by executing it. */
  expectedOutput: string | null;
}

export interface Lesson {
  id: string;
  /** 1-based position in its module. */
  order: number;
  title: string;
  /** One-line summary shown in outlines. */
  summary: string;
  level: SkillLevel;
  skillIds: string[];
  objectives: string[];
  /** Short explanation in simple language (paragraphs of plain text). */
  explanation: string[];
  /** Optional deeper explanation, collapsed by default. */
  deepDive: string[];
  examples: LessonExample[];
  activities: LearningActivity[];
  exercises: PracticeExercise[];
  resources: ExternalResource[];
  /** Short recap at the end of the lesson. */
  recap: string | null;
  estimatedMinutes: number;
  provenance: ContentProvenance;
}

export interface PortfolioProject {
  id: string;
  title: string;
  brief: string;
  requirements: string[];
  skills: string[];
  estimatedHours: number;
  provenance: ContentProvenance;
}

export interface LearningModule {
  id: string;
  /** 1-based position in its course. */
  order: number;
  kind: LearningModuleKind;
  title: string;
  description: string;
  objectives: string[];
  lessons: Lesson[];
  project: PortfolioProject | null;
  /** Sum of lesson minutes, computed from the content. */
  estimatedMinutes: number;
}

export interface SkillRef {
  id: string;
  name: string;
}

export interface CourseSummary {
  /** Stable slug, e.g. "sql-fundamentals". */
  id: string;
  title: string;
  description: string;
  format: CourseFormat;
  category: LearningCategory;
  roles: LearningRole[];
  skills: SkillRef[];
  difficulty: LearningDifficulty;
  /** Progression levels the lessons cover; null for planned courses. */
  levels: { from: SkillLevel; to: SkillLevel } | null;
  status: CourseStatus;
  outcomes: string[];
  prerequisites: string[];
  /** Courses worth taking first (ids). */
  prerequisiteCourseIds: string[];
  moduleCount: number;
  lessonCount: number;
  activityCount: number;
  hasDiagnostic: boolean;
  /** Computed from the curriculum; null for planned courses. */
  estimatedHours: number | null;
  provenance: ContentProvenance;
  /** Date (YYYY-MM-DD) of the last expert review; null when never reviewed. */
  lastReviewedOn: string | null;
}

export interface CourseDetail extends CourseSummary {
  modules: LearningModule[];
}

export interface CourseCatalogueResponse {
  courses: CourseSummary[];
}

export interface CourseCatalogueQuery {
  /** Free-text search over title, description and skills. */
  q?: string;
  category?: LearningCategory;
  skill?: string;
  role?: LearningRole;
  difficulty?: LearningDifficulty;
  status?: CourseStatus;
}

export interface LearningSkill {
  id: string;
  name: string;
  category: LearningCategory;
  description: string;
  /** Published or planned courses that teach this skill. */
  courseIds: string[];
}

export interface LearningSkillsResponse {
  skills: LearningSkill[];
}

/**
 * A role and the skills JobAssist curates for it. The list is editorial guidance, not market
 * statistics — `evidence` says exactly what it is based on.
 */
export interface LearningRoleProfile {
  id: LearningRole;
  label: string;
  category: LearningCategory;
  description: string;
  coreSkills: SkillRef[];
  evidence: { kind: 'CURATED'; basis: string; limitations: string };
}

export interface LearningRolesResponse {
  roles: LearningRoleProfile[];
}

// ─── Diagnostic assessment (level 0) ────────────────────────────────────────

export interface DiagnosticQuestion {
  id: string;
  /** The lesson whose topic this question checks. */
  lessonId: string;
  prompt: string;
  code: CodeSnippet | null;
  options: { id: string; text: string }[];
}

export interface DiagnosticAssessment {
  courseId: string;
  title: string;
  instructions: string;
  questions: DiagnosticQuestion[];
}

export interface SubmitDiagnosticRequest {
  answers: { questionId: string; optionId: string }[];
}

export type TopicRecommendation = 'SKIM' | 'STUDY';

export interface DiagnosticResult {
  attemptId: string;
  courseId: string;
  score: number;
  maxScore: number;
  completedAt: string;
  topics: {
    lessonId: string;
    lessonTitle: string;
    correct: number;
    total: number;
    /** SKIM: every question on the topic was answered correctly. Never "mastered". */
    recommendation: TopicRecommendation;
  }[];
  questions: {
    questionId: string;
    /** False when the learner skipped it (it then counts as "study", not as a wrong answer). */
    answered: boolean;
    correct: boolean;
    correctOptionId: string;
    explanation: string;
  }[];
  /** Per skill, over answered questions only. */
  skills: { skillId: string; name: string; correct: number; total: number }[];
}

// ─── Progress ───────────────────────────────────────────────────────────────

export interface NextLessonRef {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
}

export interface CourseProgress {
  courseId: string;
  /** True once the user selected the course (or recorded progress in it). */
  enrolled: boolean;
  enrolledAt: string | null;
  lessonCount: number;
  completedLessonIds: string[];
  /** Minutes of lessons not yet completed. */
  remainingMinutes: number;
  latestDiagnostic: DiagnosticResult | null;
  /** Lessons the latest diagnostic suggests skimming. */
  skimLessonIds: string[];
  /** Per-activity summary of the user's own attempts. */
  activities: {
    activityId: string;
    lessonId: string;
    attempts: number;
    latestCorrect: boolean | null;
  }[];
  nextLesson: NextLessonRef | null;
  lastActivityAt: string | null;
}

export interface RevisionItem {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  activityId: string;
  prompt: string;
}

export interface LearningDashboard {
  /** Projects, interview practice, skills to practise, jobs and the next action. */
  readiness: ReadinessOverview;
  /** Metrics calculated from persisted records (ADR-0024). */
  analytics: LearningAnalytics;
  courses: { course: CourseSummary; progress: CourseProgress }[];
  /** Activities whose latest attempt was incorrect. */
  revision: RevisionItem[];
  nextLesson: NextLessonRef | null;
  remainingMinutes: number;
  /** Skill evidence from assessments only (not lesson completion, not the resume). */
  assessedSkills: {
    skillId: string;
    name: string;
    correct: number;
    total: number;
    /** False when fewer than SKILL_EVIDENCE_MIN_QUESTIONS were asked: too few to judge. */
    sufficient: boolean;
    assessedAt: string;
  }[];
}

// ─── Resume-based recommendations ───────────────────────────────────────────

export const SKILL_CORRECTIONS = ['HAS_SKILL', 'LACKS_SKILL'] as const;
export type SkillCorrection = (typeof SKILL_CORRECTIONS)[number];

export interface LearningRecommendationRequest {
  role: LearningRole;
  /** A resume version the user owns; omitted to plan without a resume. */
  resumeVersionId?: string;
  /** The user's corrections to the extracted skills. Not stored. */
  corrections?: { skillId: string; status: SkillCorrection }[];
}

export type ResumeEvidenceKind = 'SKILLS_SECTION' | 'EXPERIENCE' | 'PROJECT' | 'SUMMARY';

/**
 * A skill counts as measured only when an assessment asked at least this many questions about
 * it. Fewer answers (even all correct) are reported, but proficiency stays UNKNOWN.
 */
export const SKILL_EVIDENCE_MIN_QUESTIONS = 3;

/**
 * What a skill judgement rests on, strongest first: an assessment with enough questions, the
 * user's own correction, what the resume says, or nothing yet.
 */
export const SKILL_JUDGEMENT_BASES = [
  'MEASURED',
  'USER_CORRECTED',
  'RESUME_EVIDENCE',
  'UNKNOWN',
] as const;
export type SkillJudgementBasis = (typeof SKILL_JUDGEMENT_BASES)[number];

export interface SkillAssessment {
  skillId: string;
  name: string;
  /** In the role's curated core skills. */
  coreForRole: boolean;
  /** Short excerpts from the user's own resume (shown only to them). */
  resumeEvidence: { kind: ResumeEvidenceKind; excerpt: string; context: string | null }[];
  /** LISTED: named only; APPLIED: used in experience or a project. Neither proves mastery. */
  evidenceStrength: 'NONE' | 'LISTED' | 'APPLIED';
  proficiency: {
    /** UNKNOWN unless an assessment measured it. */
    level: 'UNKNOWN' | 'FOUNDATIONS_DEMONSTRATED' | 'FOUNDATIONS_DEVELOPING';
    source: 'NONE' | 'ASSESSMENT';
    basis: string;
  };
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  uncertainty: string;
  userCorrection: SkillCorrection | null;
  /** What decided `gap`: a sufficient assessment, the user's correction, the resume, or nothing. */
  basis: SkillJudgementBasis;
  /** True when this skill should be learned or practised for the role. */
  gap: boolean;
  nextStep: {
    kind: 'TAKE_DIAGNOSTIC' | 'START_COURSE' | 'CONTINUE_COURSE' | 'PRACTISE' | 'NO_COURSE_YET';
    courseId: string | null;
    text: string;
  };
}

export interface RecommendedCourse {
  course: CourseSummary;
  /** 1-based position in the suggested learning sequence. */
  order: number;
  reason: string;
  skillIds: string[];
  progress: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface SkillDemandReport {
  /** Only the user's own analysed jobs — not a market-wide statistic. */
  source: 'YOUR_ANALYSED_JOBS';
  role: LearningRole | null;
  jobCount: number;
  /** Jobs from development sample data, excluded from the counts. */
  excludedSampleJobs: number;
  observedFrom: string | null;
  observedTo: string | null;
  skills: {
    name: string;
    skillId: string | null;
    postings: number;
    requiredIn: number;
    preferredIn: number;
    courseIds: string[];
  }[];
  limitations: string[];
}

export interface LearningRecommendationResponse {
  role: LearningRoleProfile;
  resume: { resumeId: string; resumeName: string; versionNumber: number } | null;
  skills: SkillAssessment[];
  courses: RecommendedCourse[];
  demand: SkillDemandReport;
  limitations: string[];
}

// ─── Interview practice (ADR-0023) ──────────────────────────────────────────

export interface InterviewPracticeQuestion {
  id: string;
  skill: SkillRef;
  difficulty: LearningDifficulty;
  prompt: string;
  /** Published courses that teach the skill. */
  courseIds: string[];
  /** Number of key concepts the rubric looks for (the concepts themselves stay hidden). */
  conceptCount: number;
  /** Suggested length, in words. */
  targetWords: number;
  /** The signed-in user's own attempts. */
  attempts: number;
  lastAttemptAt: string | null;
}

export interface InterviewPracticeQuery {
  role?: LearningRole;
  skill?: string;
  courseId?: string;
  difficulty?: LearningDifficulty;
}

export interface InterviewPracticeQuestionsResponse {
  questions: InterviewPracticeQuestion[];
}

/** Answers are limited by INTERVIEW_ANSWER_MAX_LENGTH (shared with the interview module). */
export interface SubmitInterviewAnswerRequest {
  answer: string;
}

export interface FeedbackDimension {
  /** 0–10. A practice signal, not a grade. */
  score: number;
  summary: string;
}

export interface RevisionLink {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
}

export interface InterviewFeedback {
  attemptId: string;
  questionId: string;
  attemptNumber: number;
  createdAt: string;
  answer: string;
  /** RULES: deterministic rubric. Nothing here is AI-generated. */
  source: 'RULES';
  dimensions: {
    /** Key concepts the rubric found. It cannot confirm everything written is accurate. */
    correctness: FeedbackDimension;
    clarity: FeedbackDimension;
    completeness: FeedbackDimension;
  };
  conceptsCovered: { id: string; label: string }[];
  missingConcepts: { id: string; label: string; revise: RevisionLink | null }[];
  strengths: string[];
  improvements: string[];
  /** One possible good answer — never the only valid one. */
  exampleAnswer: string;
  disclaimer: string;
}

export interface InterviewQuestionDetail {
  question: InterviewPracticeQuestion;
  /** The user's attempts, newest first. */
  attempts: InterviewFeedback[];
}

// ─── Project challenges (ADR-0023) ──────────────────────────────────────────

export const PROJECT_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ChecklistItem {
  id: string;
  text: string;
}

export interface ProjectProgress {
  status: ProjectStatus;
  checkedItemIds: string[];
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  /** Always self-reported: JobAssist does not run or inspect project code. */
  verification: 'SELF_REPORTED';
}

export interface ProjectChallengeSummary {
  id: string;
  title: string;
  summary: string;
  difficulty: LearningDifficulty;
  estimatedHours: number;
  skills: SkillRef[];
  courseIds: string[];
  provenance: ContentProvenance;
  progress: ProjectProgress;
}

export interface ProjectChallengeDetail extends ProjectChallengeSummary {
  objective: string;
  expectedOutcome: string;
  prerequisites: string[];
  requirements: string[];
  /** Must all be ticked before the project can be marked complete. */
  acceptanceCriteria: ChecklistItem[];
  steps: string[];
  testCases: string[];
  selfReview: ChecklistItem[];
  extensions: string[];
}

export interface ProjectChallengesResponse {
  challenges: ProjectChallengeSummary[];
}

export interface UpdateProjectProgressRequest {
  status: ProjectStatus;
  checkedItemIds: string[];
}

// ─── Job readiness (ADR-0023) ───────────────────────────────────────────────

export interface AnalysedJobRef {
  id: string;
  title: string;
  companyName: string;
  analysedAt: string | null;
  /** Development fixture data, never a real listing. */
  isSampleData: boolean;
  skillCount: number;
}

export interface AnalysedJobsResponse {
  jobs: AnalysedJobRef[];
}

export interface JobReadinessRequest {
  jobId: string;
  /** Defaults to the resume version selected for the job, if any. */
  resumeVersionId?: string;
  corrections?: { skillId: string; status: SkillCorrection }[];
}

export interface JobSkillReadiness {
  /** As written in the job analysis. */
  name: string;
  importance: 'REQUIRED' | 'PREFERRED';
  /** EXPLICIT: stated in the posting. INFERRED: inferred from its description. */
  jobSource: 'EXPLICIT' | 'INFERRED';
  /** Null when the skill is not in the JobAssist skill catalogue yet. */
  skillId: string | null;
  /** The user's side, with the same rules as the personalised plan. Null when not catalogued. */
  assessment: SkillAssessment | null;
  courses: { id: string; title: string; status: CourseStatus }[];
  lessons: RevisionLink[];
  projectChallenges: { id: string; title: string }[];
  interviewQuestionCount: number;
}

export interface JobReadinessResponse {
  job: AnalysedJobRef;
  resume: { resumeId: string; resumeName: string; versionNumber: number } | null;
  skills: JobSkillReadiness[];
  /** Plain counts by basis — deliberately not combined into a score. */
  counts: {
    requested: number;
    measured: number;
    resumeEvidence: number;
    userCorrected: number;
    unknown: number;
    notCatalogued: number;
    toPractise: number;
  };
  limitations: string[];
}

// ─── Readiness additions to the dashboard ───────────────────────────────────

export const NEXT_STEP_KINDS = [
  'REVISE_TOPIC',
  'CONTINUE_PROJECT',
  'CONTINUE_LESSON',
  'TAKE_DIAGNOSTIC',
  'PRACTISE_ROLE_SKILL',
  'PRACTISE_JOB_SKILL',
  'START_NEXT_COURSE',
  'EXPLORE_INTEREST',
  'START_HERE',
] as const;
export type NextStepKind = (typeof NEXT_STEP_KINDS)[number];

export interface NextAction {
  kind: NextStepKind;
  title: string;
  /** Why this is suggested now, in plain language derived from the user's own data. */
  reason: string;
  href: string;
}

/** A ranked, explained learning suggestion (ADR-0024). */
export interface NextStep extends NextAction {
  /** Stable key, used to dismiss it. */
  key: string;
  /** 1-based rank. */
  rank: number;
  /** The facts behind the suggestion. */
  evidence: string[];
  /** How much evidence supports it. LOW means sparse or conflicting evidence. */
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NextStepsResponse {
  steps: NextStep[];
  /** Suggestions hidden because the user dismissed them. */
  dismissedCount: number;
  /** What the suggestions were based on, so the user can see what is missing. */
  basedOn: {
    targetRole: LearningRole | null;
    interests: number;
    hasResume: boolean;
    analysedJobs: number;
    practiceAnswers: number;
    diagnostics: number;
  };
}

export interface ReadinessOverview {
  projects: {
    challengeId: string;
    title: string;
    status: ProjectStatus;
    checked: number;
    total: number;
    updatedAt: string | null;
  }[];
  interview: {
    attempts: number;
    questionsPractised: number;
    recent: {
      questionId: string;
      prompt: string;
      skillName: string;
      lastAttemptAt: string;
      correctness: number;
    }[];
    /** Concepts missing from the latest attempt of each question, with lessons to revise. */
    conceptsToRevise: { label: string; skillName: string; revise: RevisionLink | null }[];
  };
  /** Skills whose latest assessment is "developing" or had too few questions. */
  skillsToPractise: { skillId: string; name: string; reason: string }[];
  /** Counts only; shown only when real analysed jobs exist. */
  jobs: { analysedJobs: number; sampleJobsExcluded: number };
  nextAction: NextAction;
}

// ─── Learner preferences (ADR-0024) ─────────────────────────────────────────

export const WEEKLY_GOAL_MINUTES = [30, 60, 120, 180, 300] as const;
export const MAX_INTEREST_SKILLS = 20;

export interface LearningPreferences {
  targetRole: LearningRole | null;
  interestCategories: LearningCategory[];
  interestSkillIds: string[];
  /** Optional weekly study goal, in minutes. Never used for streaks or reminders. */
  weeklyGoalMinutes: number | null;
  dismissedSteps: { key: string; dismissedAt: string }[];
  updatedAt: string | null;
}

export interface UpdateLearningPreferencesRequest {
  targetRole: LearningRole | null;
  interestCategories: LearningCategory[];
  interestSkillIds: string[];
  weeklyGoalMinutes: number | null;
}

export interface DismissNextStepRequest {
  key: string;
}

// ─── Revision (ADR-0024) ────────────────────────────────────────────────────

export interface RevisionActivity {
  activityId: string;
  prompt: string;
  /** DUE: review now. SCHEDULED: correct recently; check again later. ALTERNATIVE: a different question on the same topic. */
  status: 'DUE' | 'SCHEDULED' | 'ALTERNATIVE';
  dueAt: string | null;
  reason: string;
}

export interface RevisionTopic {
  /** Stable key, e.g. "lesson:sql-fundamentals:sql-joins". */
  key: string;
  kind: 'PRACTICE' | 'DIAGNOSTIC' | 'INTERVIEW';
  title: string;
  courseId: string | null;
  lessonId: string | null;
  interviewQuestionId: string | null;
  skillNames: string[];
  /** Why the topic is in the list, from the user's own attempts. */
  reason: string;
  due: boolean;
  /** When a scheduled topic becomes due again. */
  dueAt: string | null;
  /** Incorrect attempts, counting answers within a few minutes of each other as one session. */
  mistakeSessions: number;
  activities: RevisionActivity[];
}

export interface RevisionQueueResponse {
  /** Due topics first (repeated mistakes before single ones), then scheduled ones. */
  topics: RevisionTopic[];
  dueCount: number;
  scheduledCount: number;
  /** Items answered correctly enough times to leave the list. */
  resolvedCount: number;
  /** Plain description of the scheduling rule. */
  method: string;
}

// ─── Learning analytics (ADR-0024) ──────────────────────────────────────────

/** Accuracy is only shown when at least this many different questions were answered. */
export const ACCURACY_MIN_QUESTIONS = 5;

export interface LearningAnalytics {
  courses: { started: number; completed: number };
  /** Lessons the user marked complete (self-reported). */
  lessonsCompleted: number;
  /** Days with any recorded activity in the last 14 days, newest first. */
  recentActivity: {
    date: string;
    lessonsCompleted: number;
    practiceAnswers: number;
    diagnostics: number;
    interviewAnswers: number;
  }[];
  lastActiveAt: string | null;
  practice: {
    /** Every recorded answer, including retries. */
    attempts: number;
    /** Different questions answered at least once. */
    questionsAnswered: number;
    /** First-try results, so repeating one question cannot inflate them. */
    firstTry: { correct: number; total: number };
    /** null when fewer than ACCURACY_MIN_QUESTIONS different questions were answered. */
    firstTryAccuracy: number | null;
    note: string;
  };
  revision: { due: number; scheduled: number };
  skills: {
    /** Measured by a diagnostic (enough questions). */
    measured: number;
    /** Assessed, but with too few questions to measure. */
    tooFewQuestions: number;
    /** Skills in the user's courses or target role with no assessment. */
    unknown: number;
  };
  /** Progress against the target role's core skills; null without a target role. */
  plan: {
    role: LearningRole;
    coreSkills: number;
    measured: number;
    demonstrated: number;
  } | null;
  interview: { attempts: number; questions: number };
  projects: { started: number; completed: number };
  week: {
    goalMinutes: number | null;
    /** Estimated from the stated length of lessons marked complete since Monday. */
    estimatedMinutes: number;
  };
}
