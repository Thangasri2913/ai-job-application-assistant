import {
  type ContentProvenance,
  type CourseDetail,
  type CourseSummary,
  type DiagnosticAssessment,
  type LearningActivity,
  type LearningModule,
  LEARNING_ROLE_LABELS,
  type LearningRoleProfile,
  type LearningSkill,
  type Lesson,
  type SkillLevel,
  type SkillRef,
} from '@job-assist/shared';
import {
  activitySourceSchema,
  type CourseSource,
  DEFAULT_LEVEL,
  diagnosticQuestionSchema,
  type LessonSource,
  type ParsedActivity,
} from './content.js';
import type { CatalogueContent } from './index.js';
import { ROLE_EVIDENCE } from './roles.js';
import type { SkillSource } from './skills.js';

/** Server-side view of one activity: the parsed source (with answers) and where it lives. */
export interface ActivityEntry {
  courseId: string;
  lessonId: string;
  activity: ParsedActivity;
}

export interface DiagnosticEntry {
  courseId: string;
  title: string;
  instructions: string;
  questions: {
    id: string;
    lessonId: string;
    prompt: string;
    code: { language: string; source: string } | null;
    options: { id: string; text: string; correct: boolean }[];
    explanation: string;
  }[];
}

export interface LessonEntry {
  courseId: string;
  moduleTitle: string;
  lesson: Lesson;
}

/** The validated catalogue, indexed for lookups. Built once at start-up. */
export interface CatalogueIndex {
  courses: CourseDetail[];
  courseById: Map<string, CourseDetail>;
  /** Lessons per course in curriculum order. */
  lessonsByCourse: Map<string, LessonEntry[]>;
  activities: Map<string, ActivityEntry>;
  diagnostics: Map<string, DiagnosticEntry>;
  skills: LearningSkill[];
  skillById: Map<string, SkillSource>;
  roles: LearningRoleProfile[];
}

export const activityKey = (courseId: string, activityId: string) => `${courseId}/${activityId}`;

const byOrder = <T extends { order: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.order - b.order);

/** The public shape of an activity: never answers, per-option feedback or explanations. */
export function toPublicActivity(
  activity: ParsedActivity,
  order: number,
  fallback: ContentProvenance,
): LearningActivity {
  const base = {
    id: activity.id,
    order,
    prompt: activity.prompt,
    code: activity.code ?? null,
    hint: activity.hint ?? null,
    provenance: activity.provenance ?? fallback,
  };
  switch (activity.type) {
    case 'MULTIPLE_CHOICE':
      return {
        ...base,
        type: activity.type,
        variant: activity.variant,
        options: activity.options.map(({ id, text }) => ({ id, text })),
      };
    case 'FILL_IN_THE_GAP':
      return {
        ...base,
        type: activity.type,
        asCode: activity.asCode,
        segments: activity.segments.map((s) =>
          typeof s === 'string'
            ? { kind: 'text' as const, text: s }
            : { kind: 'gap' as const, id: s.gap, label: s.label },
        ),
      };
    case 'SHORT_ANSWER':
      return { ...base, type: activity.type, variant: activity.variant };
    case 'CHECKLIST':
      return { ...base, type: activity.type, items: activity.items };
    case 'REFLECTION':
      return { ...base, type: activity.type };
    case 'REVISION_CARDS':
      return { ...base, type: activity.type, cards: activity.cards };
  }
}

function buildLesson(
  source: LessonSource,
  moduleKind: keyof typeof DEFAULT_LEVEL,
  parsed: ParsedActivity[],
): Lesson {
  return {
    id: source.id,
    order: source.order,
    title: source.title,
    summary: source.summary,
    level: source.level ?? DEFAULT_LEVEL[moduleKind],
    skillIds: source.skillIds ?? [],
    objectives: source.objectives,
    explanation: source.explanation,
    deepDive: source.deepDive ?? [],
    examples: source.examples.map((e) => ({
      title: e.title,
      description: e.description,
      code: e.code ?? null,
      expectedOutput: e.expectedOutput ?? null,
    })),
    activities: parsed.map((a, i) => toPublicActivity(a, i + 1, source.provenance)),
    exercises: source.exercises,
    resources: source.resources,
    recap: source.recap ?? null,
    estimatedMinutes: source.estimatedMinutes,
    provenance: source.provenance,
  };
}

const skillRefs = (ids: string[], skills: Map<string, SkillSource>): SkillRef[] =>
  ids.flatMap((id) => {
    const skill = skills.get(id);
    return skill ? [{ id, name: skill.name }] : [];
  });

/** Builds the index. Assumes `validateCatalogue` passed (it throws on invalid activities). */
export function buildCatalogue(content: CatalogueContent): CatalogueIndex {
  const skillById = new Map(content.skills.map((s) => [s.id, s]));
  const activities = new Map<string, ActivityEntry>();
  const diagnostics = new Map<string, DiagnosticEntry>();
  const lessonsByCourse = new Map<string, LessonEntry[]>();

  const courses = content.courses.map((source: CourseSource): CourseDetail => {
    const lessonEntries: LessonEntry[] = [];
    const modules: LearningModule[] = byOrder(source.modules).map((module) => {
      const lessons = byOrder(module.lessons).map((lessonSource) => {
        const parsed = (lessonSource.activities ?? []).map((a) => activitySourceSchema.parse(a));
        for (const activity of parsed)
          activities.set(activityKey(source.id, activity.id), {
            courseId: source.id,
            lessonId: lessonSource.id,
            activity,
          });
        const lesson = buildLesson(lessonSource, module.kind, parsed);
        lessonEntries.push({ courseId: source.id, moduleTitle: module.title, lesson });
        return lesson;
      });
      return {
        id: module.id,
        order: module.order,
        kind: module.kind,
        title: module.title,
        description: module.description,
        objectives: module.objectives,
        lessons,
        project: module.project,
        estimatedMinutes: lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0),
      };
    });
    lessonsByCourse.set(source.id, lessonEntries);

    if (source.diagnostic) {
      diagnostics.set(source.id, {
        courseId: source.id,
        title: source.diagnostic.title,
        instructions: source.diagnostic.instructions,
        questions: source.diagnostic.questions.map((q) => {
          const parsed = diagnosticQuestionSchema.parse(q);
          return {
            id: parsed.id,
            lessonId: parsed.lessonId,
            prompt: parsed.prompt,
            code: parsed.code ?? null,
            options: parsed.options.map((o) => ({ id: o.id, text: o.text, correct: !!o.correct })),
            explanation: parsed.explanation,
          };
        }),
      });
    }

    const lessons = modules.flatMap((m) => m.lessons);
    const minutes = lessons.reduce((sum, l) => sum + l.estimatedMinutes, 0);
    const projectHours = modules.reduce((sum, m) => sum + (m.project?.estimatedHours ?? 0), 0);
    const levels = lessons.map((l) => l.level);
    const hasProject = modules.some((m) => m.project);
    const from = (levels.length ? Math.min(...levels) : 6) as SkillLevel;
    const to = (hasProject ? 6 : Math.max(...levels)) as SkillLevel;
    return {
      id: source.id,
      title: source.title,
      description: source.description,
      format: source.format,
      category: source.category,
      roles: source.roles,
      skills: skillRefs(source.skillIds, skillById),
      difficulty: source.difficulty,
      levels: modules.length ? { from, to } : null,
      status: source.status,
      outcomes: source.outcomes,
      prerequisites: source.prerequisites,
      prerequisiteCourseIds: source.prerequisiteCourseIds ?? [],
      moduleCount: modules.length,
      lessonCount: lessons.length,
      activityCount: lessons.reduce((sum, l) => sum + l.activities.length, 0),
      hasDiagnostic: Boolean(source.diagnostic),
      // Planned courses have no curriculum yet: no estimate rather than a misleading zero.
      estimatedHours: modules.length ? Math.round((minutes / 60 + projectHours) * 2) / 2 : null,
      provenance: source.provenance,
      lastReviewedOn: source.lastReviewedOn,
      modules,
    };
  });

  const skills: LearningSkill[] = content.skills.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    courseIds: content.courses.filter((c) => c.skillIds.includes(s.id)).map((c) => c.id),
  }));

  const roles: LearningRoleProfile[] = content.roles.map((r) => ({
    id: r.id,
    label: LEARNING_ROLE_LABELS[r.id],
    category: r.category,
    description: r.description,
    coreSkills: skillRefs(r.coreSkillIds, skillById),
    evidence: ROLE_EVIDENCE,
  }));

  return {
    courses,
    courseById: new Map(courses.map((c) => [c.id, c])),
    lessonsByCourse,
    activities,
    diagnostics,
    skills,
    skillById,
    roles,
  };
}

export const toSummary = ({ modules: _modules, ...summary }: CourseDetail): CourseSummary =>
  summary;

export const toPublicDiagnostic = (d: DiagnosticEntry): DiagnosticAssessment => ({
  courseId: d.courseId,
  title: d.title,
  instructions: d.instructions,
  questions: d.questions.map(({ id, lessonId, prompt, code, options }) => ({
    id,
    lessonId,
    prompt,
    code,
    options: options.map(({ id: optionId, text }) => ({ id: optionId, text })),
  })),
});
