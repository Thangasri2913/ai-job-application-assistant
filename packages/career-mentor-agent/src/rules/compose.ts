/**
 * Rule-based answers for each intent (moved here from the API's Career Mentor prototype).
 * They use only the results of the approved tools for the request, and every recommendation is
 * registered as retrieved so validation can reject anything else.
 */
import {
  type AnalysedJobRef,
  type CourseDetail,
  type JobReadinessResponse,
  LEARNING_DIFFICULTIES,
  LEARNING_ROLE_LABELS,
  type LearningPreferences,
  type LearningRole,
  type MentorFact,
  type MentorIntent,
  type MentorProposedAction,
  type MentorRecommendation,
  type NextStep,
  type ProjectChallengeSummary,
  SKILL_EVIDENCE_MIN_QUESTIONS,
  type SkillAssessment,
} from '@job-assist/shared';
import type { MessageHints } from '../message-hints.js';
import { RetrievedResources } from '../validation.js';
import type {
  AssessmentResult,
  CatalogueResult,
  InterviewResult,
  PlanResult,
  SnapshotResult,
} from '../internal.js';

export interface ComposeInput {
  intent: MentorIntent;
  hints: MessageHints;
  catalogue: CatalogueResult;
  preferences?: LearningPreferences;
  snapshot?: SnapshotResult;
  /** Assessment of the role's core skills, or of skills named in the message. */
  assessment?: { role: LearningRole | null; skillIds: string[]; result: AssessmentResult };
  plan?: PlanResult;
  interview?: InterviewResult;
  projects?: ProjectChallengeSummary[];
  jobs?: AnalysedJobRef[];
  readiness?: JobReadinessResponse;
}

export interface ComposedAnswer {
  summary: string;
  recommendations: MentorRecommendation[];
  uncertainty: string[];
  proposedActions: MentorProposedAction[];
  factsUsed: MentorFact[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const BASIS_TEXT: Record<SkillAssessment['basis'], string> = {
  MEASURED: 'Measured by a diagnostic',
  USER_CORRECTED: 'You corrected this',
  RESUME_EVIDENCE: 'From your resume (not measured)',
  UNKNOWN: 'Unknown — not assessed yet',
};

// ── Links (built from types and ids, never from free text) ──

export const hrefFor = (
  type: MentorRecommendation['type'],
  id: string,
  courseId: string | null,
): string => {
  switch (type) {
    case 'COURSE':
      return `/learn/courses/${id}`;
    case 'LESSON':
      return `/learn/courses/${courseId}/lessons/${id}`;
    case 'DIAGNOSTIC':
      return `/learn/courses/${id}/diagnostic`;
    case 'REVISION_TOPIC':
      return `/learn/revision?topic=${encodeURIComponent(id)}`;
    case 'INTERVIEW_QUESTION':
      return `/learn/interview/${id}`;
    case 'PROJECT_CHALLENGE':
      return `/learn/projects/${id}`;
    case 'JOB':
      return `/jobs/${id}`;
  }
};

const rec = (
  type: MentorRecommendation['type'],
  id: string,
  courseId: string | null,
  title: string,
  reason: string,
  evidence: string[] = [],
): MentorRecommendation => ({
  type,
  id,
  courseId,
  title,
  reason,
  href: hrefFor(type, id, courseId),
  evidence: evidence.filter(Boolean).slice(0, 5),
});

/** Maps an existing next step (ADR-0024) to a recommendation, using its own link. */
export function stepToRecommendation(step: NextStep): MentorRecommendation | null {
  const [path = '', query = ''] = step.href.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== 'learn') return null;
  if (parts[1] === 'revision') {
    const topic = new URLSearchParams(query).get('topic');
    return topic
      ? rec('REVISION_TOPIC', topic, null, step.title, step.reason, step.evidence)
      : null;
  }
  if (parts[1] === 'projects' && parts[2])
    return rec('PROJECT_CHALLENGE', parts[2], null, step.title, step.reason, step.evidence);
  if (parts[1] === 'courses' && parts[2]) {
    if (parts[3] === 'lessons' && parts[4])
      return rec('LESSON', parts[4], parts[2], step.title, step.reason, step.evidence);
    if (parts[3] === 'diagnostic')
      return rec('DIAGNOSTIC', parts[2], parts[2], step.title, step.reason, step.evidence);
    if (!parts[3]) return rec('COURSE', parts[2], null, step.title, step.reason, step.evidence);
  }
  return null; // e.g. the preferences anchor: not a resource
}

// ── Registry of what was retrieved for this request ──

export function retrievedResources(input: ComposeInput): RetrievedResources {
  const r = new RetrievedResources();
  for (const c of input.catalogue.courses) {
    r.add('COURSE', c.id);
    if (c.hasDiagnostic) r.add('DIAGNOSTIC', c.id, c.id);
    for (const m of c.modules) for (const l of m.lessons) r.add('LESSON', l.id, c.id);
  }
  for (const t of input.snapshot?.snapshot.revision.topics ?? []) r.add('REVISION_TOPIC', t.key);
  for (const s of input.snapshot?.snapshot.nextSteps.steps ?? []) {
    const mapped = stepToRecommendation(s);
    if (mapped?.type === 'PROJECT_CHALLENGE') r.add('PROJECT_CHALLENGE', mapped.id);
  }
  for (const q of input.interview?.questions ?? []) r.add('INTERVIEW_QUESTION', q.id);
  for (const p of input.projects ?? []) r.add('PROJECT_CHALLENGE', p.id);
  for (const p of input.readiness?.skills.flatMap((s) => s.projectChallenges) ?? [])
    r.add('PROJECT_CHALLENGE', p.id);
  for (const j of input.jobs ?? []) r.add('JOB', j.id);
  return r;
}

// ── Shared helpers ──

function focusSkillIds(input: ComposeInput): { ids: string[]; from: string } {
  if (input.hints.skillIds.length) return { ids: input.hints.skillIds, from: 'your question' };
  const role = input.preferences?.targetRole ?? input.hints.role;
  if (role) {
    const core = input.catalogue.roleCoreSkills.get(role) ?? [];
    if (core.length) return { ids: core, from: `the ${LEARNING_ROLE_LABELS[role]} role` };
  }
  const enrolled = [...(input.snapshot?.enrolledCourseIds ?? [])];
  const fromCourses = [
    ...new Set(
      input.catalogue.courses
        .filter((c) => enrolled.includes(c.id))
        .flatMap((c) => c.skills.map((s) => s.id)),
    ),
  ];
  if (fromCourses.length) return { ids: fromCourses, from: 'the courses you selected' };
  return { ids: [], from: '' };
}

const skillName = (input: ComposeInput, id: string) => input.catalogue.skills.get(id)?.name ?? id;
const roleLabel = (role: LearningRole) => LEARNING_ROLE_LABELS[role];

function addCourseAction(
  input: ComposeInput,
  course: CourseDetail,
  why: string,
): MentorProposedAction | null {
  if (input.snapshot?.enrolledCourseIds.has(course.id)) return null;
  return {
    type: 'ADD_COURSE',
    courseId: course.id,
    label: `Add ${course.title} to My learning`,
    description: why,
  };
}

function setRoleAction(input: ComposeInput): MentorProposedAction[] {
  const role = input.hints.role;
  if (!role || input.preferences?.targetRole === role) return [];
  return [
    {
      type: 'SET_TARGET_ROLE',
      role,
      label: `Set ${roleLabel(role)} as my target role`,
      description:
        'Saves it in your learning preferences so suggestions are tailored to this role. You can change it at any time.',
    },
  ];
}

function preferencesFacts(input: ComposeInput): MentorFact[] {
  const prefs = input.preferences;
  return [
    { label: 'Target role', value: prefs?.targetRole ? roleLabel(prefs.targetRole) : 'Not set' },
  ];
}

// ── Intent composers ──

function generalProgress(input: ComposeInput): ComposedAnswer {
  const { snapshot, enrolledCourseIds } = input.snapshot!;
  const a = snapshot.analytics;
  const steps = snapshot.nextSteps.steps;
  const started = a.lessonsCompleted > 0 || a.practice.attempts > 0 || a.courses.started > 0;
  const summary = started
    ? `So far you have marked ${plural(a.lessonsCompleted, 'lesson')} complete across ${plural(a.courses.started, 'course')} and answered ${plural(a.practice.attempts, 'practice question')}.` +
      (a.revision.due
        ? ` ${plural(a.revision.due, 'revision topic')} ${a.revision.due === 1 ? 'is' : 'are'} due.`
        : '') +
      (steps[0] ? ` Suggested next: ${steps[0].title}.` : '')
    : `You have not started any learning yet — nothing personal is needed to begin.${steps[0] ? ` A good first step: ${steps[0].title}.` : ''}`;

  const recommendations = steps
    .flatMap((s) => {
      const r = stepToRecommendation(s);
      return r ? [r] : [];
    })
    .slice(0, 4);

  const uncertainty: string[] = [];
  if (!input.preferences?.targetRole)
    uncertainty.push(
      'You have not set a target role, so these suggestions are not tailored to a role. You can choose one in your learning preferences.',
    );
  if (a.practice.firstTryAccuracy === null) uncertainty.push(a.practice.note);
  if (a.skills.unknown)
    uncertainty.push(
      `${plural(a.skills.unknown, 'relevant skill')} ${a.skills.unknown === 1 ? 'has' : 'have'} not been assessed yet, so the level is unknown — not mastered.`,
    );
  if (steps[0]?.confidence === 'LOW')
    uncertainty.push('The top suggestion is based on limited evidence so far.');

  const proposedActions = steps
    .filter((s) => ['START_HERE', 'START_NEXT_COURSE', 'EXPLORE_INTEREST'].includes(s.kind))
    .flatMap((s) => {
      const r = stepToRecommendation(s);
      const course =
        r?.type === 'COURSE' ? input.catalogue.courses.find((c) => c.id === r.id) : undefined;
      const action =
        course && !enrolledCourseIds.has(course.id)
          ? addCourseAction(input, course, s.reason)
          : null;
      return action ? [action] : [];
    })
    .slice(0, 2);

  return {
    summary,
    recommendations,
    uncertainty,
    proposedActions,
    factsUsed: [
      { label: 'Lessons marked complete', value: String(a.lessonsCompleted) },
      {
        label: 'Courses started',
        value: `${a.courses.started} (${a.courses.completed} completed)`,
      },
      {
        label: 'Practice answers',
        value: `${a.practice.attempts} on ${plural(a.practice.questionsAnswered, 'question')}`,
      },
      {
        label: 'First-try accuracy',
        value:
          a.practice.firstTryAccuracy === null
            ? 'Not enough data yet'
            : `${a.practice.firstTryAccuracy}% (${a.practice.firstTry.correct} of ${a.practice.firstTry.total})`,
      },
      { label: 'Revision', value: `${a.revision.due} due, ${a.revision.scheduled} later` },
      ...preferencesFacts(input),
    ],
  };
}

function skillGaps(input: ComposeInput): ComposedAnswer {
  const enrolled = input.snapshot?.enrolledCourseIds ?? new Set<string>();
  const assessment = input.assessment;
  const uncertainty: string[] = [];
  const recommendations: MentorRecommendation[] = [];

  const recommendFor = (s: SkillAssessment, why: string) => {
    const course = input.catalogue.bestCourse(s.skillId);
    if (!course) {
      uncertainty.push(`There is no published course for ${s.name} yet.`);
      return;
    }
    if (s.proficiency.level === 'UNKNOWN' && course.hasDiagnostic && !enrolled.has(course.id))
      recommendations.push(
        rec(
          'DIAGNOSTIC',
          course.id,
          course.id,
          `Check your ${s.name} level`,
          `${why} A short diagnostic would measure the fundamentals.`,
          [BASIS_TEXT[s.basis], s.uncertainty],
        ),
      );
    else
      recommendations.push(
        rec('COURSE', course.id, null, `Practise ${s.name} in ${course.title}`, why, [
          BASIS_TEXT[s.basis],
          s.proficiency.basis,
        ]),
      );
  };

  if (assessment?.role) {
    const role = assessment.role;
    const skills = assessment.result.skills;
    const gaps = skills.filter((s) => s.gap);
    const measured = skills.filter((s) => s.basis === 'MEASURED').length;
    for (const s of gaps.slice(0, 5))
      recommendFor(s, `${s.name} is a core skill for ${roleLabel(role)}. ${s.uncertainty}`);
    if (!assessment.result.hasResume)
      uncertainty.push(
        'No default resume with reviewed content was available, so resume evidence was not used.',
      );
    const unknown = skills.filter((s) => s.proficiency.level === 'UNKNOWN').length;
    if (unknown)
      uncertainty.push(
        `Proficiency is unknown for ${plural(unknown, 'skill')} because ${unknown === 1 ? 'it has' : 'they have'} not been measured by a diagnostic.`,
      );
    uncertainty.push('The role skill list is curated guidance, not market statistics.');
    const fromMessage = !input.preferences?.targetRole;
    return {
      summary: `For ${roleLabel(role)}${fromMessage ? ' (the role named in your question)' : ', your target role'}, ${plural(gaps.length, 'core skill')} of ${skills.length} ${gaps.length === 1 ? 'is' : 'are'} worth learning or practising; ${measured} ${measured === 1 ? 'has' : 'have'} been measured by a diagnostic.`,
      recommendations,
      uncertainty,
      proposedActions: setRoleAction(input),
      factsUsed: [
        { label: 'Role', value: roleLabel(role) },
        { label: 'Core skills', value: String(skills.length) },
        { label: 'Measured by a diagnostic', value: String(measured) },
        {
          label: 'From your resume',
          value: String(skills.filter((s) => s.basis === 'RESUME_EVIDENCE').length),
        },
        { label: 'Unknown', value: String(unknown) },
        { label: 'Resume used', value: assessment.result.hasResume ? 'Default resume' : 'None' },
      ],
    };
  }

  if (assessment && assessment.skillIds.length) {
    const skills = assessment.result.skills;
    for (const s of skills) recommendFor(s, `You asked about ${s.name}. ${s.uncertainty}`);
    uncertainty.push(
      'You have not set a target role, so these skills were not compared with a role.',
    );
    return {
      summary: `Here is what your records show for ${skills.map((s) => s.name).join(', ')}.`,
      recommendations,
      uncertainty,
      proposedActions: setRoleAction(input),
      factsUsed: skills.map((s) => ({ label: s.name, value: BASIS_TEXT[s.basis] })),
    };
  }

  // No role and no named skills: what the diagnostics show.
  const evidence = [...(input.snapshot?.skillEvidence ?? [])];
  const flagged = evidence.filter(
    ([, e]) => e.total < SKILL_EVIDENCE_MIN_QUESTIONS || e.correct / e.total < 0.8,
  );
  for (const [skillId, e] of flagged.slice(0, 4)) {
    const course = input.catalogue.bestCourse(skillId);
    if (!course) continue;
    const name = skillName(input, skillId);
    recommendations.push(
      rec(
        'COURSE',
        course.id,
        null,
        `Practise ${name} in ${course.title}`,
        e.total < SKILL_EVIDENCE_MIN_QUESTIONS
          ? `Only ${plural(e.total, 'diagnostic question')} on ${name} so far — too few to measure it.`
          : `${e.correct} of ${e.total} correct in your latest diagnostic.`,
        ['From diagnostics only'],
      ),
    );
  }
  uncertainty.push(
    'You have not set a target role or named a skill, so there is nothing to compare your skills against. Choose a target role in your learning preferences, or ask about a specific skill.',
  );
  if (!evidence.length)
    uncertainty.push('You have not taken a diagnostic yet, so no skill has been measured.');
  return {
    summary: evidence.length
      ? `Without a target role, this is what your diagnostics show: ${plural(evidence.length, 'skill')} assessed, ${flagged.length} still to practise or measure.`
      : 'Without a target role or any diagnostics yet, there are no measured skills to compare. A diagnostic in any course you are interested in is a good start.',
    recommendations,
    uncertainty,
    proposedActions: setRoleAction(input),
    factsUsed: [
      { label: 'Skills assessed', value: String(evidence.length) },
      ...preferencesFacts(input),
    ],
  };
}

function learningPlan(input: ComposeInput): ComposedAnswer {
  const steps = input.snapshot?.snapshot.nextSteps.steps ?? [];
  const recommendations: MentorRecommendation[] = [];
  const proposedActions: MentorProposedAction[] = [];
  const uncertainty: string[] = [];

  // Continue what is already in progress.
  const lesson = steps.find((s) => s.kind === 'CONTINUE_LESSON');
  const continueRec = lesson ? stepToRecommendation(lesson) : null;
  if (continueRec) recommendations.push(continueRec);

  if (input.plan) {
    const { role, plan } = input.plan;
    for (const r of plan.courses) {
      const course = input.catalogue.courses.find((c) => c.id === r.course.id);
      if (!course) continue;
      recommendations.push(
        rec('COURSE', course.id, null, `${r.order}. ${course.title}`, r.reason, [
          r.progress === 'NOT_STARTED'
            ? 'Not started'
            : r.progress === 'COMPLETED'
              ? 'All lessons marked complete'
              : 'In progress',
        ]),
      );
      const action = addCourseAction(input, course, r.reason);
      if (action && proposedActions.length < 2) proposedActions.push(action);
    }
    uncertainty.push(...plan.limitations.slice(0, 2));
    if (!plan.courses.length)
      uncertainty.push('No published course covers the remaining gaps for this role yet.');
    return {
      summary: plan.courses.length
        ? `A suggested order of ${plural(plan.courses.length, 'course')} for ${roleLabel(role)}, covering core skills that are not yet evidenced. Prerequisites and difficulty decide the order.`
        : `Your records already cover the published courses for ${roleLabel(role)}, or no course exists yet for the remaining skills.`,
      recommendations,
      uncertainty,
      proposedActions: [...setRoleAction(input), ...proposedActions].slice(0, 3),
      factsUsed: [
        { label: 'Role', value: roleLabel(role) },
        { label: 'Courses in the plan', value: String(plan.courses.length) },
        {
          label: 'Resume used',
          value: plan.resume
            ? `${plan.resume.resumeName} (version ${plan.resume.versionNumber})`
            : 'None',
        },
      ],
    };
  }

  // No role: skills named in the message, then the general next steps.
  for (const id of input.hints.skillIds) {
    const course = input.catalogue.bestCourse(id);
    if (!course) continue;
    recommendations.push(
      rec(
        'COURSE',
        course.id,
        null,
        course.title,
        `It teaches ${skillName(input, id)}, which you asked about.`,
      ),
    );
    const action = addCourseAction(input, course, `It teaches ${skillName(input, id)}.`);
    if (action && proposedActions.length < 2) proposedActions.push(action);
  }
  for (const s of steps.filter((x) =>
    ['START_NEXT_COURSE', 'EXPLORE_INTEREST', 'START_HERE'].includes(x.kind),
  )) {
    const r = stepToRecommendation(s);
    if (r) recommendations.push(r);
  }
  uncertainty.push(
    'You have not set a target role, so this is a general plan. Choose a role in your learning preferences, or name one in your question, for a role-specific sequence.',
  );
  return {
    summary:
      'A general learning plan from your progress and interests. It is not tailored to a role yet.',
    recommendations: recommendations.slice(0, 6),
    uncertainty,
    proposedActions: [...setRoleAction(input), ...proposedActions].slice(0, 3),
    factsUsed: [
      ...preferencesFacts(input),
      {
        label: 'Interests set',
        value: String(
          (input.preferences?.interestCategories.length ?? 0) +
            (input.preferences?.interestSkillIds.length ?? 0),
        ),
      },
    ],
  };
}

function interviewPrep(input: ComposeInput): ComposedAnswer {
  const { questions, overview } = input.interview!;
  const focus = focusSkillIds(input);
  const recommendations: MentorRecommendation[] = [];
  const uncertainty: string[] = [
    'Practice feedback is keyword-based and does not predict how a real interview will go.',
  ];

  for (const t of (input.snapshot?.snapshot.revision.topics ?? [])
    .filter((t) => t.kind === 'INTERVIEW' && t.due)
    .slice(0, 2))
    recommendations.push(rec('REVISION_TOPIC', t.key, null, `Revise for "${t.title}"`, t.reason));

  const matching = focus.ids.length
    ? questions.filter((q) => focus.ids.includes(q.skill.id))
    : questions;
  const ordered = [...matching].sort(
    (a, b) =>
      (a.attempts ? 1 : 0) - (b.attempts ? 1 : 0) ||
      LEARNING_DIFFICULTIES.indexOf(a.difficulty) - LEARNING_DIFFICULTIES.indexOf(b.difficulty),
  );
  for (const q of ordered.slice(0, 4))
    recommendations.push(
      rec(
        'INTERVIEW_QUESTION',
        q.id,
        null,
        q.prompt,
        q.attempts
          ? `You have answered this ${plural(q.attempts, 'time')}; another attempt shows whether the feedback stuck.`
          : `A ${q.difficulty.toLowerCase()} ${q.skill.name} question you have not practised yet.`,
        [`Skill: ${q.skill.name}`],
      ),
    );

  const withoutQuestions = focus.ids.filter((id) => !questions.some((q) => q.skill.id === id));
  if (withoutQuestions.length)
    uncertainty.push(
      `There are no practice questions for ${withoutQuestions.map((id) => skillName(input, id)).join(', ')} yet.`,
    );
  if (!focus.ids.length)
    uncertainty.push(
      'No skill was named in your question and no target role or course is set, so questions cover all skills.',
    );
  const practised = matching.filter((q) => q.attempts).length;
  return {
    summary: `${plural(matching.length, 'practice question')} ${focus.ids.length ? `match ${focus.from}` : 'are available'}; you have practised ${practised} of them.${overview.conceptsToRevise.length ? ` Your latest answers missed ${plural(overview.conceptsToRevise.length, 'concept')} worth revising.` : ''}`,
    recommendations,
    uncertainty,
    proposedActions: setRoleAction(input),
    factsUsed: [
      { label: 'Interview answers', value: String(overview.attempts) },
      { label: 'Questions practised', value: String(overview.questionsPractised) },
      ...(focus.ids.length
        ? [{ label: 'Focus', value: focus.ids.map((id) => skillName(input, id)).join(', ') }]
        : []),
    ],
  };
}

function projectIdeas(input: ComposeInput): ComposedAnswer {
  const projects = input.projects ?? [];
  const focus = focusSkillIds(input);
  const overlap = (p: ProjectChallengeSummary) => p.skills.filter((s) => focus.ids.includes(s.id));
  const inProgress = projects.filter((p) => p.progress.status === 'IN_PROGRESS');
  const fresh = projects
    .filter((p) => p.progress.status === 'NOT_STARTED')
    .sort(
      (a, b) =>
        overlap(b).length - overlap(a).length ||
        LEARNING_DIFFICULTIES.indexOf(a.difficulty) - LEARNING_DIFFICULTIES.indexOf(b.difficulty),
    );
  const recommendations = [
    ...inProgress.map((p) =>
      rec(
        'PROJECT_CHALLENGE',
        p.id,
        null,
        `Continue: ${p.title}`,
        `You started this project; ${plural(p.progress.checkedItemIds.length, 'checklist item')} ticked so far.`,
        ['Self-reported progress'],
      ),
    ),
    ...fresh.map((p) => {
      const matched = overlap(p);
      return rec(
        'PROJECT_CHALLENGE',
        p.id,
        null,
        p.title,
        matched.length
          ? `Practises ${matched.map((s) => s.name).join(', ')} from ${focus.from}. About ${p.estimatedHours} hours.`
          : `${p.summary} About ${p.estimatedHours} hours.`,
        [`Skills: ${p.skills.map((s) => s.name).join(', ')}`],
      );
    }),
  ].slice(0, 3);
  const completed = projects.filter((p) => p.progress.status === 'COMPLETED').length;
  return {
    summary: projects.length
      ? `${plural(projects.length, 'project challenge')} ${projects.length === 1 ? 'is' : 'are'} available${inProgress.length ? `; you have ${inProgress.length} in progress` : ''}${completed ? ` and ${completed} marked complete` : ''}.`
      : 'There are no project challenges available yet.',
    recommendations,
    uncertainty: [
      'Project progress is self-reported; JobAssist does not run or check your code.',
      ...(focus.ids.length
        ? []
        : [
            'No skill was named in your question and no target role or course is set, so suggestions are not tailored.',
          ]),
    ],
    proposedActions: setRoleAction(input),
    factsUsed: [
      { label: 'Challenges available', value: String(projects.length) },
      { label: 'In progress', value: String(inProgress.length) },
      { label: 'Completed (self-reported)', value: String(completed) },
    ],
  };
}

function jobFit(input: ComposeInput): ComposedAnswer {
  const jobs = input.jobs ?? [];
  const readiness = input.readiness;
  if (!jobs.length || !readiness)
    return {
      summary:
        'You have not analysed any jobs yet, so there is no job to compare with. Add a job posting and analyse it under Jobs, then ask again — or keep learning without one.',
      recommendations: [],
      uncertainty: [
        'Job comparisons use only jobs you add and analyse in JobAssist. No job listings are invented.',
      ],
      proposedActions: [],
      factsUsed: [{ label: 'Analysed jobs', value: '0' }],
    };

  const { job, skills, counts } = readiness;
  const recommendations: MentorRecommendation[] = [
    rec(
      'JOB',
      job.id,
      null,
      `${job.title} — ${job.companyName}`,
      `The job being compared${job.isSampleData ? ' (development sample data, not a real listing)' : ''}.`,
    ),
  ];
  for (const s of skills.filter((x) => x.assessment?.gap && x.skillId)) {
    if (recommendations.length >= 6) break;
    const why = `${s.name} is ${s.importance === 'REQUIRED' ? 'required' : 'preferred'} by this job. ${s.assessment!.uncertainty}`;
    const lesson = s.lessons[0];
    const course = s.courses.find((c) => c.status === 'PUBLISHED');
    if (lesson)
      recommendations.push(
        rec(
          'LESSON',
          lesson.lessonId,
          lesson.courseId,
          `Learn ${s.name}: ${lesson.lessonTitle}`,
          why,
          [BASIS_TEXT[s.assessment!.basis]],
        ),
      );
    else if (course)
      recommendations.push(
        rec('COURSE', course.id, null, `Learn ${s.name}: ${course.title}`, why, [
          BASIS_TEXT[s.assessment!.basis],
        ]),
      );
    const project = s.projectChallenges[0];
    if (project && recommendations.length < 6)
      recommendations.push(
        rec(
          'PROJECT_CHALLENGE',
          project.id,
          null,
          `Project: ${project.title}`,
          `Practises ${s.name}, which this job asks for.`,
        ),
      );
  }
  const notCatalogued = skills.filter((s) => !s.skillId).map((s) => s.name);
  return {
    summary: `${job.title} at ${job.companyName} asks for ${plural(counts.requested, 'skill')}: ${counts.measured} measured by a diagnostic, ${counts.resumeEvidence} from your resume, ${counts.unknown} unknown. ${plural(counts.toPractise, 'skill')} ${counts.toPractise === 1 ? 'is' : 'are'} worth learning or practising. These are separate counts, not a score.`,
    recommendations,
    uncertainty: [
      ...readiness.limitations.slice(0, 3),
      ...(notCatalogued.length
        ? [
            `Not in the JobAssist skill catalogue yet, so not linked or assessed: ${notCatalogued.slice(0, 5).join(', ')}.`,
          ]
        : []),
      ...(jobs.length > 1
        ? [`You have ${plural(jobs.length, 'analysed job')}; choose another one to compare.`]
        : []),
    ],
    proposedActions: [],
    factsUsed: [
      { label: 'Job', value: `${job.title} — ${job.companyName}` },
      { label: 'Skills requested', value: String(counts.requested) },
      { label: 'Measured', value: String(counts.measured) },
      { label: 'From your resume', value: String(counts.resumeEvidence) },
      { label: 'Unknown', value: String(counts.unknown) },
      {
        label: 'Resume used',
        value: readiness.resume
          ? `${readiness.resume.resumeName} (version ${readiness.resume.versionNumber})`
          : 'None',
      },
    ],
  };
}

const COMPOSERS: Record<MentorIntent, (input: ComposeInput) => ComposedAnswer> = {
  GENERAL_PROGRESS: generalProgress,
  SKILL_GAPS: skillGaps,
  LEARNING_PLAN: learningPlan,
  INTERVIEW_PREP: interviewPrep,
  PROJECT_IDEAS: projectIdeas,
  JOB_FIT: jobFit,
};

/** Deterministic answer for an intent, from the lookups' results only. */
export function composeAnswer(input: ComposeInput): ComposedAnswer {
  return COMPOSERS[input.intent](input);
}
