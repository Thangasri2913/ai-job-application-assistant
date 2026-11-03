import type {
  CourseDetail,
  LearningAnalytics,
  LearningRole,
  NextStepsResponse,
  RevisionQueueResponse,
} from '@job-assist/shared';
import type {
  CatalogueSkill,
  CatalogueSnapshot,
  InterviewPracticeResult,
  LearningPlanResult,
  LearningSnapshot,
  SkillAssessmentResult,
} from './types.js';

/** Normalised catalogue used by the rules (maps and a course lookup). */
export interface CatalogueResult {
  courses: CourseDetail[];
  skills: Map<string, CatalogueSkill>;
  roleCoreSkills: Map<LearningRole, string[]>;
  /** The published course that teaches a skill most directly, if any. */
  bestCourse(skillId: string): CourseDetail | undefined;
}

export interface SnapshotResult {
  snapshot: {
    nextSteps: NextStepsResponse;
    revision: RevisionQueueResponse;
    analytics: LearningAnalytics;
  };
  enrolledCourseIds: Set<string>;
  skillEvidence: Map<string, { correct: number; total: number }>;
}

export type AssessmentResult = SkillAssessmentResult;
export type PlanResult = LearningPlanResult;
export type InterviewResult = InterviewPracticeResult;

export function normaliseCatalogue(c: CatalogueSnapshot): CatalogueResult {
  const courses = c.courses.filter((course) => course.status === 'PUBLISHED');
  const byId = new Map(courses.map((course) => [course.id, course]));
  return {
    courses,
    skills: new Map(c.skills.map((s) => [s.id, s])),
    roleCoreSkills: new Map(Object.entries(c.roleCoreSkills) as [LearningRole, string[]][]),
    bestCourse: (skillId) => {
      const id = c.bestCourseBySkill[skillId];
      return id ? byId.get(id) : undefined;
    },
  };
}

export function normaliseSnapshot(s: LearningSnapshot): SnapshotResult {
  return {
    snapshot: { nextSteps: s.nextSteps, revision: s.revision, analytics: s.analytics },
    enrolledCourseIds: new Set(s.enrolledCourseIds),
    skillEvidence: new Map(
      s.skillEvidence.map((e) => [e.skillId, { correct: e.correct, total: e.total }]),
    ),
  };
}
