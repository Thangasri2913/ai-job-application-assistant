import { LEARNING_ID_PATTERN, LEARNING_ROLES } from '@job-assist/shared';
import { skillKey } from '../../../common/skills/skill-normalization.js';
import { BACKEND_DEVELOPER } from './backend-developer.js';
import { activitySourceSchema, type CourseSource, diagnosticQuestionSchema } from './content.js';
import { FRONTEND_DEVELOPER } from './frontend-developer.js';
import { GENERATIVE_AI_FUNDAMENTALS } from './generative-ai-fundamentals.js';
import { INTERVIEW_QUESTIONS, type InterviewQuestionSource } from './interview-questions.js';
import { JAVASCRIPT_ESSENTIALS } from './javascript-essentials.js';
import { PLANNED_COURSES } from './planned.js';
import { PROJECT_CHALLENGES, type ProjectChallengeSource } from './project-challenges.js';
import { ROLES, type RoleSource } from './roles.js';
import { SKILLS, type SkillSource } from './skills.js';
import { SOFTWARE_TESTING_FUNDAMENTALS } from './software-testing-fundamentals.js';
import { SQL_FUNDAMENTALS } from './sql-fundamentals.js';

/** Every course, in display order. Add new courses here (see docs/LEARN-AND-PREPARE.md). */
export const CATALOGUE: CourseSource[] = [
  JAVASCRIPT_ESSENTIALS,
  SQL_FUNDAMENTALS,
  SOFTWARE_TESTING_FUNDAMENTALS,
  GENERATIVE_AI_FUNDAMENTALS,
  FRONTEND_DEVELOPER,
  BACKEND_DEVELOPER,
  ...PLANNED_COURSES,
];

export interface CatalogueContent {
  courses: CourseSource[];
  skills: SkillSource[];
  roles: RoleSource[];
  interviewQuestions: InterviewQuestionSource[];
  projectChallenges: ProjectChallengeSource[];
}

export const CONTENT: CatalogueContent = {
  courses: CATALOGUE,
  skills: SKILLS,
  roles: ROLES,
  interviewQuestions: INTERVIEW_QUESTIONS,
  projectChallenges: PROJECT_CHALLENGES,
};

/**
 * Integrity rules every catalogue must meet; checked by tests and when the module starts, so a
 * broken catalogue never ships silently. Returns problems (empty = valid).
 */
export function validateCatalogue({
  courses,
  skills,
  roles,
  interviewQuestions,
  projectChallenges,
}: CatalogueContent): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const unique = (kind: string, id: string) => {
    if (!LEARNING_ID_PATTERN.test(id))
      problems.push(`${kind} id "${id}" is not a lowercase-hyphen slug`);
    if (ids.has(`${kind}:${id}`)) problems.push(`duplicate ${kind} id "${id}"`);
    ids.add(`${kind}:${id}`);
  };
  const ordered = (where: string, orders: number[]) => {
    const sorted = [...orders].sort((a, b) => a - b);
    if (sorted.some((o, i) => o !== i + 1))
      problems.push(`${where}: order must be 1..${orders.length} without gaps`);
  };

  const skillIds = new Set<string>();
  // Names and spellings must point at exactly one skill, or resume matching becomes ambiguous.
  const nameOwner = new Map<string, string>();
  for (const skill of skills) {
    unique('skill', skill.id);
    skillIds.add(skill.id);
    for (const name of [skill.name, ...(skill.alsoKnownAs ?? [])]) {
      const owner = nameOwner.get(skillKey(name));
      if (owner && owner !== skill.id)
        problems.push(`skill name "${name}" is used by both "${owner}" and "${skill.id}"`);
      nameOwner.set(skillKey(name), skill.id);
    }
  }
  const knownSkills = (where: string, list: string[]) => {
    for (const id of list) if (!skillIds.has(id)) problems.push(`${where}: unknown skill "${id}"`);
  };

  const courseIds = new Set(courses.map((c) => c.id));
  const resourceUrls = new Map<string, string>();
  for (const course of courses) {
    unique('course', course.id);
    knownSkills(`course "${course.id}"`, course.skillIds);
    if (course.skillIds.length === 0) problems.push(`course "${course.id}" teaches no skills`);
    if (course.roles.length === 0) problems.push(`course "${course.id}" has no roles`);
    for (const pre of course.prerequisiteCourseIds ?? []) {
      if (!courseIds.has(pre))
        problems.push(`course "${course.id}": unknown prerequisite "${pre}"`);
      if (pre === course.id) problems.push(`course "${course.id}" is its own prerequisite`);
    }
    if (course.status === 'PLANNED' && (course.modules.length > 0 || course.diagnostic))
      problems.push(`course "${course.id}" is PLANNED but has content`);
    if (course.status === 'PUBLISHED' && course.modules.length === 0)
      problems.push(`course "${course.id}" is PUBLISHED but has no modules`);
    if (course.lastReviewedOn !== null && course.provenance.review.status !== 'REVIEWED')
      problems.push(`course "${course.id}" has a review date but is not marked REVIEWED`);

    ordered(
      `course "${course.id}" modules`,
      course.modules.map((m) => m.order),
    );
    const lessonIds = new Set<string>();
    for (const module of course.modules) {
      unique('module', module.id);
      ordered(
        `module "${module.id}" lessons`,
        module.lessons.map((l) => l.order),
      );
      if (module.lessons.length === 0 && !module.project)
        problems.push(`module "${module.id}" has neither lessons nor a project`);
      if (module.project) unique('project', module.project.id);
      for (const lesson of module.lessons) {
        unique('lesson', lesson.id);
        lessonIds.add(lesson.id);
        knownSkills(`lesson "${lesson.id}"`, lesson.skillIds ?? []);
        if (lesson.estimatedMinutes <= 0)
          problems.push(`lesson "${lesson.id}" needs a positive duration`);
        for (const exercise of lesson.exercises) unique('exercise', exercise.id);
        for (const activity of lesson.activities ?? []) {
          const parsed = activitySourceSchema.safeParse(activity);
          if (!parsed.success)
            problems.push(
              `activity "${activity.id}": ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`,
            );
          unique('activity', activity.id);
        }
        for (const r of lesson.resources) {
          if (!/^https:\/\//.test(r.url)) problems.push(`resource "${r.id}" must use https`);
          knownSkills(`resource "${r.id}"`, r.skillIds);
          const seen = resourceUrls.get(r.id);
          if (seen && seen !== r.url) problems.push(`resource id "${r.id}" points to two URLs`);
          resourceUrls.set(r.id, r.url);
        }
      }
    }

    if (course.diagnostic) {
      if (course.diagnostic.questions.length === 0)
        problems.push(`course "${course.id}" diagnostic has no questions`);
      for (const question of course.diagnostic.questions) {
        unique('diagnostic question', question.id);
        const parsed = diagnosticQuestionSchema.safeParse(question);
        if (!parsed.success)
          problems.push(
            `diagnostic question "${question.id}": ${parsed.error.issues.map((i) => i.message).join('; ')}`,
          );
        if (!lessonIds.has(question.lessonId))
          problems.push(
            `diagnostic question "${question.id}" refers to lesson "${question.lessonId}" outside its course`,
          );
      }
    }
  }

  for (const role of roles) {
    unique('role', role.id.toLowerCase().replace(/_/g, '-'));
    knownSkills(`role "${role.id}"`, role.coreSkillIds);
  }
  // Lessons in published courses, for revision links.
  const publishedLessons = new Set(
    courses
      .filter((c) => c.status === 'PUBLISHED')
      .flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => l.id))),
  );
  for (const question of interviewQuestions) {
    unique('interview question', question.id);
    knownSkills(`interview question "${question.id}"`, [question.skillId]);
    if (question.concepts.length < 2)
      problems.push(`interview question "${question.id}" needs at least 2 concepts`);
    const conceptIds = new Set<string>();
    for (const concept of question.concepts) {
      if (conceptIds.has(concept.id))
        problems.push(`interview question "${question.id}": duplicate concept "${concept.id}"`);
      conceptIds.add(concept.id);
      if (!publishedLessons.has(concept.lessonId))
        problems.push(
          `interview question "${question.id}": concept "${concept.id}" links to unknown lesson "${concept.lessonId}"`,
        );
      if (concept.patterns.length === 0)
        problems.push(
          `interview question "${question.id}": concept "${concept.id}" has no patterns`,
        );
      for (const pattern of concept.patterns) {
        try {
          new RegExp(pattern, 'i');
        } catch {
          problems.push(`interview question "${question.id}": invalid pattern "${pattern}"`);
        }
      }
    }
  }

  const projectIds = new Map(
    courses.map((c) => [
      c.id,
      new Set(c.modules.flatMap((m) => (m.project ? [m.project.id] : []))),
    ]),
  );
  for (const challenge of projectChallenges) {
    unique('project challenge', challenge.id);
    knownSkills(`project challenge "${challenge.id}"`, challenge.skillIds);
    for (const courseId of challenge.courseIds) {
      const course = courses.find((c) => c.id === courseId);
      if (!course || course.status !== 'PUBLISHED')
        problems.push(`project challenge "${challenge.id}": course "${courseId}" is not published`);
    }
    for (const projectId of challenge.expandsProjectIds)
      if (!challenge.courseIds.some((c) => projectIds.get(c)?.has(projectId)))
        problems.push(`project challenge "${challenge.id}": unknown course project "${projectId}"`);
    const items = [...challenge.acceptanceCriteria, ...challenge.selfReview].map((i) => i.id);
    if (new Set(items).size !== items.length)
      problems.push(`project challenge "${challenge.id}": checklist ids must be unique`);
    if (challenge.acceptanceCriteria.length === 0)
      problems.push(`project challenge "${challenge.id}" needs acceptance criteria`);
  }

  for (const role of LEARNING_ROLES) {
    if (!roles.some((r) => r.id === role)) problems.push(`role "${role}" has no profile`);
    if (!courses.some((c) => c.roles.includes(role))) problems.push(`role "${role}" has no course`);
  }
  return problems;
}
