import {
  type CourseDetail,
  type CourseProgress,
  LEARNING_CATEGORY_LABELS,
  LEARNING_ROLE_LABELS,
  type LearningPreferences,
  type NextStep,
  type ReadinessOverview,
  type RevisionQueueResponse,
  type SkillAssessment,
} from '@job-assist/shared';

/** Suggestions returned at most. */
export const MAX_NEXT_STEPS = 8;

export interface JobSkillDemand {
  skillId: string;
  name: string;
  postings: number;
  requiredIn: number;
}

export interface NextStepsInput {
  revision: RevisionQueueResponse;
  projects: ReadinessOverview['projects'];
  /** Courses in "My learning", most recently active first. */
  enrolled: { course: CourseDetail; progress: CourseProgress }[];
  /** All courses in the catalogue. */
  courses: CourseDetail[];
  /** Course ids whose lessons are all marked complete. */
  completedCourseIds: Set<string>;
  /** Course ids with any recorded progress (enrolled or not). */
  startedCourseIds: Set<string>;
  preferences: LearningPreferences | null;
  /** Target role core skills, assessed with the plan's rules (empty without a role). */
  roleSkills: SkillAssessment[];
  /** Catalogue skills from the user's real analysed jobs, most frequent first. */
  jobSkills: JobSkillDemand[];
  analysedJobs: number;
  dismissedKeys: Set<string>;
}

type Draft = Omit<NextStep, 'rank'>;

/** The published skill course that teaches a skill most directly (skill courses first). */
export function bestCourseFor(courses: CourseDetail[], skillId: string): CourseDetail | undefined {
  return courses
    .filter((c) => c.status === 'PUBLISHED' && c.skills.some((s) => s.id === skillId))
    .sort(
      (a, b) =>
        (a.format === 'SKILL_COURSE' ? 0 : 1) - (b.format === 'SKILL_COURSE' ? 0 : 1) ||
        a.skills.length - b.skills.length,
    )[0];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Ranks next learning steps (ADR-0024) in a fixed, explainable order:
 * practice mistakes due for revision (repeated first) → project in progress → next lesson →
 * pending diagnostic → diagnostic/interview topics to revise → target-role skills → analysed-job skills → courses whose prerequisites are done
 * → interests → a default starting point. Every step says why, with the facts behind it.
 */
export function rankNextSteps(input: NextStepsInput): {
  steps: NextStep[];
  dismissedCount: number;
} {
  const drafts: Draft[] = [];
  const add = (d: Draft) => {
    if (!drafts.some((x) => x.key === d.key || x.href === d.href)) drafts.push(d);
  };
  const enrolledIds = new Set(input.enrolled.map((e) => e.course.id));
  const courseHref = (course: CourseDetail) => {
    const e = input.enrolled.find((x) => x.course.id === course.id);
    return e?.progress.nextLesson
      ? `/learn/courses/${course.id}/lessons/${e.progress.nextLesson.lessonId}`
      : `/learn/courses/${course.id}`;
  };

  // Revision steps: practice mistakes are strong evidence and come first; a single wrong
  // diagnostic answer or a keyword-based interview gap is weaker and comes after lessons.
  const revisionStep = (t: RevisionQueueResponse['topics'][number]): Draft => ({
    key: `revise:${t.key}`,
    kind: 'REVISE_TOPIC',
    title: t.kind === 'INTERVIEW' ? `Revise for "${t.title}"` : `Review "${t.title}"`,
    reason: t.reason,
    href: `/learn/revision?topic=${encodeURIComponent(t.key)}`,
    evidence: [
      t.kind === 'PRACTICE'
        ? `Mistakes on ${plural(t.mistakeSessions, 'separate visit')}`
        : t.kind === 'DIAGNOSTIC'
          ? 'Incorrect diagnostic answers on this topic'
          : 'Concepts missing from your latest interview answer (keyword-based check)',
    ],
    confidence: t.mistakeSessions >= 2 ? 'HIGH' : t.kind === 'PRACTICE' ? 'MEDIUM' : 'LOW',
  });
  const dueTopics = input.revision.topics.filter((x) => x.due);

  // 1. Practice mistakes that are due now.
  for (const t of dueTopics.filter((x) => x.kind === 'PRACTICE').slice(0, 3)) add(revisionStep(t));

  // 2. A project already in progress.
  for (const p of input.projects.filter((x) => x.status === 'IN_PROGRESS').slice(0, 1))
    add({
      key: `project:${p.challengeId}`,
      kind: 'CONTINUE_PROJECT',
      title: `Continue "${p.title}"`,
      reason: `You started this project and have ticked ${p.checked} of ${p.total} acceptance criteria.`,
      href: `/learn/projects/${p.challengeId}`,
      evidence: ['Self-reported project progress'],
      confidence: 'HIGH',
    });

  // 3. The next lesson in selected courses.
  for (const { course, progress } of input.enrolled
    .filter((e) => e.progress.nextLesson)
    .slice(0, 2)) {
    const next = progress.nextLesson!;
    const lessons = course.modules.flatMap((m) => m.lessons);
    const index = lessons.findIndex((l) => l.id === next.lessonId);
    const previous = index > 0 ? lessons[index - 1] : undefined;
    const reason =
      previous && progress.completedLessonIds.includes(previous.id)
        ? `You completed "${previous.title}", the lesson before it in ${course.title}.`
        : progress.completedLessonIds.length === 0
          ? `It is the first lesson to study in ${course.title}, a course you selected.`
          : `It is the next lesson you have not completed in ${course.title}.`;
    add({
      key: `lesson:${course.id}:${next.lessonId}`,
      kind: 'CONTINUE_LESSON',
      title: `Continue with "${next.lessonTitle}"`,
      reason: progress.skimLessonIds.length
        ? `${reason} Lessons your diagnostic suggested skimming come later.`
        : reason,
      href: `/learn/courses/${course.id}/lessons/${next.lessonId}`,
      evidence: [
        `${progress.completedLessonIds.length} of ${progress.lessonCount} lessons marked complete`,
      ],
      confidence: 'HIGH',
    });
  }

  // 4. A diagnostic for a selected course that has none yet.
  for (const { course, progress } of input.enrolled
    .filter(
      (e) =>
        e.course.hasDiagnostic &&
        !e.progress.latestDiagnostic &&
        e.progress.completedLessonIds.length === 0,
    )
    .slice(0, 1))
    add({
      key: `diagnostic:${course.id}`,
      kind: 'TAKE_DIAGNOSTIC',
      title: `Take the ${course.title} diagnostic`,
      reason:
        'Take a diagnostic to establish your current level. It suggests lessons you can skim and records evidence for your skills.',
      href: `/learn/courses/${course.id}/diagnostic`,
      evidence: [`${progress.lessonCount} lessons in the course; none completed yet`],
      confidence: 'MEDIUM',
    });

  // 4b. Diagnostic and interview topics to revise.
  for (const t of dueTopics.filter((x) => x.kind !== 'PRACTICE').slice(0, 2)) add(revisionStep(t));

  // 5. Core skills of the target role that need learning or measuring.
  const role = input.preferences?.targetRole ?? null;
  const covered = new Set<string>();
  if (role) {
    for (const skill of input.roleSkills.filter((s) => s.gap || s.basis !== 'MEASURED')) {
      if (drafts.filter((d) => d.kind === 'PRACTISE_ROLE_SKILL').length >= 3) break;
      const course = bestCourseFor(input.courses, skill.skillId);
      if (!course || skill.userCorrection === 'HAS_SKILL') continue;
      covered.add(skill.skillId);
      const roleLabel = LEARNING_ROLE_LABELS[role];
      const unmeasured = skill.proficiency.level === 'UNKNOWN';
      const useDiagnostic =
        unmeasured && course.hasDiagnostic && !input.startedCourseIds.has(course.id);
      const resumeNote =
        skill.evidenceStrength === 'APPLIED'
          ? ' Your resume shows it used in experience; a diagnostic would confirm the fundamentals.'
          : skill.evidenceStrength === 'LISTED'
            ? ' Your resume lists it but shows no use of it.'
            : '';
      add({
        key: `role:${role}:${skill.skillId}`,
        kind: 'PRACTISE_ROLE_SKILL',
        title: useDiagnostic ? `Check your ${skill.name} level` : `Practise ${skill.name}`,
        reason: unmeasured
          ? `${skill.name} is a core skill for ${roleLabel}, your target role, and it has not been measured yet.${resumeNote}`
          : `${skill.name} is a core skill for ${roleLabel}. ${skill.proficiency.basis}`,
        href: useDiagnostic ? `/learn/courses/${course.id}/diagnostic` : courseHref(course),
        evidence: [
          `Core skill for ${roleLabel} (curated list, not market statistics)`,
          skill.uncertainty,
        ],
        confidence: skill.proficiency.source === 'ASSESSMENT' ? 'HIGH' : 'MEDIUM',
      });
    }
  }

  // 6. Skills that appear in the user's own analysed jobs and are not measured.
  for (const job of input.jobSkills) {
    if (drafts.filter((d) => d.kind === 'PRACTISE_JOB_SKILL').length >= 2) break;
    if (covered.has(job.skillId)) continue;
    const course = bestCourseFor(input.courses, job.skillId);
    if (!course) continue;
    covered.add(job.skillId);
    add({
      key: `job-skill:${job.skillId}`,
      kind: 'PRACTISE_JOB_SKILL',
      title: `Learn ${job.name} for the jobs you analysed`,
      reason: `${job.name} appears in ${plural(job.postings, 'job')} you analysed (${job.requiredIn} as required).`,
      href: courseHref(course),
      evidence: [
        `${job.postings} of your ${plural(input.analysedJobs, 'analysed job')}`,
        'Only your own analysed jobs are counted',
      ],
      confidence: job.postings >= 2 ? 'MEDIUM' : 'LOW',
    });
  }

  // 7. Courses whose prerequisite courses are all completed.
  for (const course of input.courses) {
    if (course.status !== 'PUBLISHED' || !course.prerequisiteCourseIds.length) continue;
    if (input.startedCourseIds.has(course.id)) continue;
    if (!course.prerequisiteCourseIds.every((id) => input.completedCourseIds.has(id))) continue;
    const titles = course.prerequisiteCourseIds.map(
      (id) => input.courses.find((c) => c.id === id)?.title ?? id,
    );
    add({
      key: `next-course:${course.id}`,
      kind: 'START_NEXT_COURSE',
      title: `Start ${course.title}`,
      reason: `You completed ${titles.join(' and ')}, which this course builds on.`,
      href: `/learn/courses/${course.id}`,
      evidence: ['All prerequisite courses marked complete'],
      confidence: 'HIGH',
    });
  }

  // 8. The user's stated interests.
  const interests = input.preferences;
  if (interests && (interests.interestCategories.length || interests.interestSkillIds.length)) {
    const matches = input.courses.filter(
      (c) =>
        c.status === 'PUBLISHED' &&
        !input.startedCourseIds.has(c.id) &&
        (interests.interestCategories.includes(c.category) ||
          c.skills.some((s) => interests.interestSkillIds.includes(s.id))),
    );
    for (const course of matches.slice(0, 2)) {
      const skill = course.skills.find((s) => interests.interestSkillIds.includes(s.id));
      add({
        key: `interest:${course.id}`,
        kind: 'EXPLORE_INTEREST',
        title: `Explore ${course.title}`,
        reason: skill
          ? `Matches your interest in ${skill.name}.`
          : `Matches your interest in ${LEARNING_CATEGORY_LABELS[course.category].toLowerCase()}.`,
        href: `/learn/courses/${course.id}`,
        evidence: ['Interest you chose in your learning preferences'],
        confidence: 'MEDIUM',
      });
    }
  }

  // 9. Defaults when there is little to go on — no personal information needed.
  if (drafts.length < 3) {
    const starter = input.courses.find(
      (c) =>
        c.status === 'PUBLISHED' &&
        c.format === 'SKILL_COURSE' &&
        c.difficulty === 'BEGINNER' &&
        !c.prerequisiteCourseIds.length &&
        !input.startedCourseIds.has(c.id) &&
        !enrolledIds.has(c.id),
    );
    if (starter)
      add({
        key: `start:${starter.id}`,
        kind: 'START_HERE',
        title: `Start with ${starter.title}`,
        reason:
          'A beginner course with no prerequisites and a short diagnostic — a good general starting point. You do not need a resume or a target role.',
        href: `/learn/courses/${starter.id}`,
        evidence: [
          'General suggestion: there is little learning activity to base a personal one on yet',
        ],
        confidence: 'LOW',
      });
    if (
      !input.preferences?.targetRole &&
      !input.preferences?.interestCategories.length &&
      !input.preferences?.interestSkillIds.length
    )
      add({
        key: 'start:preferences',
        kind: 'START_HERE',
        title: 'Optionally choose a target role or interests',
        reason:
          'Suggestions stay general until you do. Both are optional and you can change them at any time.',
        href: '/learn/my-learning#learning-preferences',
        evidence: ['No target role or interests set'],
        confidence: 'LOW',
      });
  }

  const visible = drafts.filter((d) => !input.dismissedKeys.has(d.key));
  return {
    steps: visible.slice(0, MAX_NEXT_STEPS).map((d, i) => ({ ...d, rank: i + 1 })),
    dismissedCount: drafts.length - visible.length,
  };
}
