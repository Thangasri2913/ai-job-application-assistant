import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LEARNING_DIFFICULTIES,
  type CourseDetail,
  type LearningRecommendationRequest,
  type LearningRecommendationResponse,
  type RecommendedCourse,
  type SkillAssessment,
  type SkillCorrection,
  SKILL_EVIDENCE_MIN_QUESTIONS,
  type SkillJudgementBasis,
} from '@job-assist/shared';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { ResumesService } from '../../resumes/resumes.service.js';
import { toSummary } from '../catalogue/build.js';
import { LearningProgressService } from '../learning-progress.service.js';
import { LearningService } from '../learning.service.js';
import { findResumeEvidence, type SkillEvidence } from './resume-evidence.js';
import { SkillDemandService } from './skill-demand.service.js';

/** Share of diagnostic questions answered correctly to call the fundamentals demonstrated. */
const DEMONSTRATED_RATIO = 0.8;
/** Courses suggested in one learning sequence. */
const MAX_COURSES = 5;

type Assessed = { correct: number; total: number; assessedAt: Date; courseId: string };

const LIMITATIONS = [
  'Resume evidence shows what your resume says, not how well you know a skill. Proficiency stays "unknown" until you take an assessment.',
  'Skills are matched by name; a skill described in other words may be missed. Correct the list below if so.',
  'The role skill list is curated guidance, not market statistics. Observed demand comes only from jobs you analysed.',
  'Your corrections are used for this recommendation only and are not saved.',
];

/**
 * Personalised learning recommendations (ADR-0022). Deterministic: resume content is read
 * through ResumesService (owner-scoped) and never sent to an AI provider or stored by this
 * module. Assessment evidence comes from the user's own diagnostic results.
 */
@Injectable()
export class LearningRecommendationsService {
  constructor(
    private readonly catalogue: LearningService,
    private readonly progress: LearningProgressService,
    private readonly resumes: ResumesService,
    private readonly demand: SkillDemandService,
  ) {}

  async recommend(
    userId: string,
    request: LearningRecommendationRequest,
  ): Promise<LearningRecommendationResponse> {
    const role = this.catalogue.index.roles.find((r) => r.id === request.role)!;
    const coreIds = role.coreSkills.map((s) => s.id);
    const [{ resume, skills, states }, demand] = await Promise.all([
      this.assessSkills(userId, {
        coreSkillIds: coreIds,
        includeEvidencedSkills: true,
        resumeVersionId: request.resumeVersionId,
        corrections: request.corrections,
      }),
      this.demand.forUser(userId, request.role),
    ]);

    return {
      role,
      resume,
      skills,
      courses: this.sequence(
        skills.filter((s) => s.gap),
        request.role,
        states,
      ),
      demand,
      limitations: resume
        ? LIMITATIONS
        : [
            ...LIMITATIONS.slice(2),
            'No resume selected: every core skill is treated as not yet evidenced.',
          ],
    };
  }

  /**
   * Assesses skills for the user with the plan's rules (resume evidence, assessment evidence,
   * user corrections). Shared by the personalised plan and job readiness, so both judge skills
   * the same way. Resume content is read owner-scoped and never stored.
   */
  async assessSkills(
    userId: string,
    options: {
      coreSkillIds: string[];
      /** Also return non-core skills found in the resume or corrected by the user. */
      includeEvidencedSkills: boolean;
      resumeVersionId?: string | null;
      corrections?: { skillId: string; status: SkillCorrection }[];
    },
  ): Promise<{
    resume: LearningRecommendationResponse['resume'];
    skills: SkillAssessment[];
    states: Map<string, { enrolled: boolean; completed: number }>;
  }> {
    const { index } = this.catalogue;
    const corrections = new Map<string, SkillCorrection>();
    for (const c of options.corrections ?? []) {
      if (!index.skillById.has(c.skillId))
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.BAD_REQUEST,
          'Unknown skill in corrections.',
        );
      corrections.set(c.skillId, c.status);
    }

    let resume: LearningRecommendationResponse['resume'] = null;
    let evidence = new Map<string, SkillEvidence>();
    if (options.resumeVersionId) {
      // Owner-scoped: another user's version id behaves like a missing one.
      const version = await this.resumes.getVersionContent(userId, options.resumeVersionId);
      if (!version)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ErrorCode.NOT_FOUND,
          'Resume version not found.',
        );
      if (!version.content)
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.RESUME_CONTENT_MISSING,
          'This resume version has no reviewed content yet. Review it in the resume library first.',
        );
      resume = {
        resumeId: version.resumeId,
        resumeName: version.resumeName,
        versionNumber: version.versionNumber,
      };
      evidence = findResumeEvidence(version.content, [...index.skillById.values()]);
    }

    const [assessed, states] = await Promise.all([
      this.progress.latestSkillEvidence(userId),
      this.progress.courseStates(userId),
    ]);

    const coreIds = [...new Set(options.coreSkillIds)];
    // Core skills first, then other catalogue skills the resume or the user mentions.
    const otherIds = options.includeEvidencedSkills
      ? [...new Set([...evidence.keys(), ...corrections.keys()])].filter(
          (id) => !coreIds.includes(id),
        )
      : [];
    const skills = [...coreIds, ...otherIds].map((skillId) =>
      this.assessSkill(skillId, coreIds.includes(skillId), {
        evidence: evidence.get(skillId),
        assessed: assessed.get(skillId),
        correction: corrections.get(skillId) ?? null,
        hasResume: Boolean(resume),
        states,
      }),
    );
    return { resume, skills, states };
  }

  private assessSkill(
    skillId: string,
    coreForRole: boolean,
    ctx: {
      evidence: SkillEvidence | undefined;
      assessed: Assessed | undefined;
      correction: SkillCorrection | null;
      hasResume: boolean;
      states: Map<string, { enrolled: boolean; completed: number }>;
    },
  ): SkillAssessment {
    const skill = this.catalogue.index.skillById.get(skillId)!;
    const strength = ctx.evidence?.strength ?? 'NONE';
    const { assessed, correction } = ctx;

    // An assessment measures a skill only with enough questions; fewer are reported, not trusted.
    const measured =
      assessed && assessed.total >= SKILL_EVIDENCE_MIN_QUESTIONS ? assessed : undefined;
    const when = (a: Assessed) =>
      `the ${this.courseTitle(a.courseId)} diagnostic on ${a.assessedAt.toISOString().slice(0, 10)}`;
    const proficiency: SkillAssessment['proficiency'] = measured
      ? {
          level:
            measured.correct / measured.total >= DEMONSTRATED_RATIO
              ? 'FOUNDATIONS_DEMONSTRATED'
              : 'FOUNDATIONS_DEVELOPING',
          source: 'ASSESSMENT',
          basis: `${measured.correct} of ${measured.total} correct in ${when(measured)}. This covers fundamentals only.`,
        }
      : {
          level: 'UNKNOWN',
          source: 'NONE',
          basis: assessed
            ? `Only ${assessed.total} question${assessed.total === 1 ? '' : 's'} on this skill in ${when(assessed)} (${assessed.correct} correct) — too few to measure it.`
            : 'Not assessed. A resume mention is not a measure of proficiency.',
        };

    const demonstrated = proficiency.level === 'FOUNDATIONS_DEMONSTRATED';
    const basis: SkillJudgementBasis = correction
      ? 'USER_CORRECTED'
      : measured
        ? 'MEASURED'
        : strength !== 'NONE'
          ? 'RESUME_EVIDENCE'
          : 'UNKNOWN';
    const gap = !coreForRole
      ? false
      : correction === 'LACKS_SKILL'
        ? true
        : correction === 'HAS_SKILL' || demonstrated
          ? false
          : proficiency.level === 'FOUNDATIONS_DEVELOPING' || strength !== 'APPLIED';

    const confidence: SkillAssessment['confidence'] = measured
      ? 'HIGH'
      : correction || strength === 'APPLIED'
        ? 'MEDIUM'
        : 'LOW';

    const uncertainty = measured
      ? 'Based on a short diagnostic of fundamentals; advanced skills were not tested.'
      : correction === 'HAS_SKILL'
        ? 'Based on your own statement; take the diagnostic to check the fundamentals.'
        : correction === 'LACKS_SKILL'
          ? 'Based on your own statement.'
          : strength === 'APPLIED'
            ? 'Your resume shows the skill used in experience or a project; depth is unknown.'
            : strength === 'LISTED'
              ? 'Your resume lists the skill but shows no use of it in experience or projects.'
              : ctx.hasResume
                ? 'No mention found in the selected resume. It may still be a skill you have.'
                : 'No resume selected.';

    return {
      skillId,
      name: skill.name,
      coreForRole,
      resumeEvidence: ctx.evidence?.items ?? [],
      evidenceStrength: strength,
      proficiency,
      confidence,
      uncertainty,
      userCorrection: correction,
      basis,
      gap,
      nextStep: this.nextStep(skillId, {
        gap,
        assessed: Boolean(measured),
        demonstrated,
        strength,
        states: ctx.states,
      }),
    };
  }

  private nextStep(
    skillId: string,
    ctx: {
      gap: boolean;
      assessed: boolean;
      demonstrated: boolean;
      strength: SkillAssessment['evidenceStrength'];
      states: Map<string, { enrolled: boolean; completed: number }>;
    },
  ): SkillAssessment['nextStep'] {
    const course = this.bestCourseFor(skillId);
    if (!course) {
      const planned = this.catalogue.index.courses.find(
        (c) => c.status === 'PLANNED' && c.skills.some((s) => s.id === skillId),
      );
      return {
        kind: 'NO_COURSE_YET',
        courseId: planned?.id ?? null,
        text: planned
          ? `A course for this skill ("${planned.title}") is planned but not available yet. Use the curated resources in related courses meanwhile.`
          : 'There is no JobAssist course for this skill yet.',
      };
    }
    const state = ctx.states.get(course.id);
    if (state && state.completed > 0 && state.completed < course.lessonCount)
      return { kind: 'CONTINUE_COURSE', courseId: course.id, text: `Continue "${course.title}".` };
    if (!ctx.assessed && course.hasDiagnostic && (ctx.strength !== 'NONE' || !ctx.gap))
      return {
        kind: 'TAKE_DIAGNOSTIC',
        courseId: course.id,
        text: `Take the short "${course.title}" diagnostic to see which lessons you can skim.`,
      };
    if (!ctx.gap)
      return {
        kind: 'PRACTISE',
        courseId: course.id,
        text: ctx.demonstrated
          ? `Fundamentals look solid. Practise with the advanced lessons and project in "${course.title}".`
          : `Practise with the activities and project in "${course.title}" to build evidence.`,
      };
    return { kind: 'START_COURSE', courseId: course.id, text: `Start "${course.title}".` };
  }

  /** The published course that teaches a skill most directly: skill courses before tracks. */
  private bestCourseFor(skillId: string): CourseDetail | undefined {
    return this.catalogue.index.courses
      .filter((c) => c.status === 'PUBLISHED' && c.skills.some((s) => s.id === skillId))
      .sort(
        (a, b) =>
          (a.format === 'SKILL_COURSE' ? 0 : 1) - (b.format === 'SKILL_COURSE' ? 0 : 1) ||
          a.skills.length - b.skills.length,
      )[0];
  }

  /**
   * A short learning sequence covering the gap skills: the most direct course per skill,
   * then the role's career track for anything left, ordered by prerequisites and difficulty.
   */
  private sequence(
    gaps: SkillAssessment[],
    role: LearningRecommendationRequest['role'],
    states: Map<string, { enrolled: boolean; completed: number }>,
  ): RecommendedCourse[] {
    const chosen = new Map<string, { course: CourseDetail; skillIds: string[] }>();
    const uncovered: string[] = [];
    for (const g of gaps) {
      const course = this.bestCourseFor(g.skillId);
      if (!course) continue;
      if (course.format === 'SKILL_COURSE') {
        const entry = chosen.get(course.id) ?? { course, skillIds: [] };
        entry.skillIds.push(g.skillId);
        chosen.set(course.id, entry);
      } else uncovered.push(g.skillId);
    }
    if (uncovered.length) {
      const track = this.catalogue.index.courses.find(
        (c) => c.status === 'PUBLISHED' && c.format === 'CAREER_TRACK' && c.roles.includes(role),
      );
      const tracks = track
        ? [track]
        : uncovered.flatMap((id) => {
            const c = this.bestCourseFor(id);
            return c ? [c] : [];
          });
      for (const t of tracks) {
        const entry = chosen.get(t.id) ?? { course: t, skillIds: [] };
        for (const id of uncovered)
          if (t.skills.some((s) => s.id === id) && !entry.skillIds.includes(id))
            entry.skillIds.push(id);
        if (entry.skillIds.length) chosen.set(t.id, entry);
      }
    }

    const ids = new Set(chosen.keys());
    const depth = (c: CourseDetail, seen = new Set<string>()): number =>
      Math.max(
        0,
        ...c.prerequisiteCourseIds
          .filter((p) => ids.has(p) && !seen.has(p))
          .map((p) => 1 + depth(this.catalogue.index.courseById.get(p)!, new Set([...seen, c.id]))),
      );
    const ordered = [...chosen.values()]
      .sort(
        (a, b) =>
          depth(a.course) - depth(b.course) ||
          LEARNING_DIFFICULTIES.indexOf(a.course.difficulty) -
            LEARNING_DIFFICULTIES.indexOf(b.course.difficulty) ||
          b.skillIds.length - a.skillIds.length ||
          a.course.title.localeCompare(b.course.title),
      )
      .slice(0, MAX_COURSES);

    const names = (skillIds: string[]) =>
      skillIds.map((id) => this.catalogue.index.skillById.get(id)?.name ?? id).join(', ');
    return ordered.map(({ course, skillIds }, i) => {
      const state = states.get(course.id);
      return {
        course: toSummary(course),
        order: i + 1,
        skillIds,
        reason: `Covers ${names(skillIds)} — core skills for this role that are not yet evidenced or that you marked as missing.`,
        progress: !state?.completed
          ? 'NOT_STARTED'
          : state.completed >= course.lessonCount
            ? 'COMPLETED'
            : 'IN_PROGRESS',
      };
    });
  }

  private courseTitle(courseId: string) {
    return this.catalogue.index.courseById.get(courseId)?.title ?? 'course';
  }
}
