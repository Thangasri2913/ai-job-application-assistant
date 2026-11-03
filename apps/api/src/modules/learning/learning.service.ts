import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CourseCatalogueQuery,
  type CourseCatalogueResponse,
  type CourseDetail,
  type DiagnosticAssessment,
  LEARNING_ID_PATTERN,
  type LearningRolesResponse,
  type LearningSkillsResponse,
  type RevisionLink,
} from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  type ActivityEntry,
  activityKey,
  buildCatalogue,
  type CatalogueIndex,
  type DiagnosticEntry,
  type LessonEntry,
  toPublicDiagnostic,
  toSummary,
} from './catalogue/build.js';
import { CONTENT, validateCatalogue } from './catalogue/index.js';

export const learningNotFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found.`);

/** Lower-case words for search: "Node.js APIs" → ["node.js", "apis"]. */
const words = (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Learn & Prepare catalogue (ADR-0021, ADR-0022): static, code-reviewed content served
 * read-only. Validated at start-up; the API refuses to start with an invalid catalogue.
 */
@Injectable()
export class LearningService {
  readonly index: CatalogueIndex;
  private readonly lessonLinks = new Map<string, RevisionLink>();

  constructor() {
    const problems = validateCatalogue(CONTENT);
    if (problems.length) throw new Error(`Invalid learning catalogue:\n${problems.join('\n')}`);
    this.index = buildCatalogue(CONTENT);
    // Skill courses first, so revision links prefer the focused course over a career track.
    const ordered = [...this.index.courses].sort(
      (a, b) => (a.format === 'SKILL_COURSE' ? 0 : 1) - (b.format === 'SKILL_COURSE' ? 0 : 1),
    );
    for (const course of ordered.filter((c) => c.status === 'PUBLISHED'))
      for (const { lesson } of this.index.lessonsByCourse.get(course.id) ?? [])
        if (!this.lessonLinks.has(lesson.id))
          this.lessonLinks.set(lesson.id, {
            courseId: course.id,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
          });
  }

  list(query: CourseCatalogueQuery = {}): CourseCatalogueResponse {
    const terms = query.q ? words(query.q) : [];
    const courses = this.index.courses
      .filter(
        (c) =>
          (!query.category || c.category === query.category) &&
          (!query.skill || c.skills.some((s) => s.id === query.skill)) &&
          (!query.role || c.roles.includes(query.role)) &&
          (!query.difficulty || c.difficulty === query.difficulty) &&
          (!query.status || c.status === query.status),
      )
      .filter((c) => {
        if (!terms.length) return true;
        const haystack = [c.title, c.description, ...c.skills.map((s) => s.name)]
          .join(' ')
          .toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .map(toSummary);
    return { courses };
  }

  /** Malformed ids are reported like unknown ones (404). */
  get(courseId: string): CourseDetail {
    const course = LEARNING_ID_PATTERN.test(courseId)
      ? this.index.courseById.get(courseId)
      : undefined;
    if (!course) throw learningNotFound('Course');
    return course;
  }

  skills(): LearningSkillsResponse {
    return { skills: this.index.skills };
  }

  roles(): LearningRolesResponse {
    return { roles: this.index.roles };
  }

  /** A published course's lesson, or 404. */
  lesson(courseId: string, lessonId: string): LessonEntry {
    const entry = this.lessons(courseId).find((l) => l.lesson.id === lessonId);
    if (!entry) throw learningNotFound('Lesson');
    return entry;
  }

  lessons(courseId: string): LessonEntry[] {
    this.get(courseId);
    return this.index.lessonsByCourse.get(courseId) ?? [];
  }

  /** Server-side activity (with answers), or 404. */
  activity(courseId: string, activityId: string): ActivityEntry {
    this.get(courseId);
    const entry = this.index.activities.get(activityKey(courseId, activityId));
    if (!entry) throw learningNotFound('Activity');
    return entry;
  }

  diagnosticEntry(courseId: string): DiagnosticEntry {
    this.get(courseId);
    const diagnostic = this.index.diagnostics.get(courseId);
    if (!diagnostic) throw learningNotFound('Diagnostic assessment');
    return diagnostic;
  }

  /** Where a lesson can be revised (its published course), or null. */
  revisionLink(lessonId: string): RevisionLink | null {
    return this.lessonLinks.get(lessonId) ?? null;
  }

  /** Published courses teaching a skill. */
  publishedCourseIdsFor(skillId: string): string[] {
    return this.index.courses
      .filter((c) => c.status === 'PUBLISHED' && c.skills.some((s) => s.id === skillId))
      .map((c) => c.id);
  }

  diagnostic(courseId: string): DiagnosticAssessment {
    return toPublicDiagnostic(this.diagnosticEntry(courseId));
  }
}
