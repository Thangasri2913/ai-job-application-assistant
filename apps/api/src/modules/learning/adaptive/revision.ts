import type { RevisionActivity, RevisionQueueResponse, RevisionTopic } from '@job-assist/shared';

/**
 * Revision scheduling (ADR-0024). Deterministic and explainable, deliberately simple:
 *
 * - Answers to the same question within SESSION_GAP_MINUTES of each other form one session,
 *   so trying several answers in a row counts as one mistake, not many.
 * - After a mistake the question is due now. If it was corrected in the same session, it comes
 *   back after 1 day. After a later session answered correctly on the first try it comes back
 *   after 3 days; after a second such session it leaves the list.
 * - These intervals are a plain rule of thumb, not a validated spacing model.
 */
export const SESSION_GAP_MINUTES = 10;
const CORRECTED_INTERVAL_DAYS = 1;
const ONE_CLEAN_INTERVAL_DAYS = 3;
const CLEAN_SESSIONS_TO_RESOLVE = 2;
const MAX_ALTERNATIVES = 3;
const DAY = 24 * 60 * 60 * 1000;

export const REVISION_METHOD =
  'A question you answer incorrectly is due now. If you corrected it straight away it comes back the next day; after one later visit answered correctly first time it comes back 3 days later; after two such visits it leaves the list. Tries a few minutes apart count as one visit, so experimenting is not counted as repeated mistakes. Other questions from the same lesson are offered so you are not just repeating the one you saw.';

export interface AttemptRecord {
  courseId: string;
  lessonId: string;
  activityId: string;
  /** null for self-reported activities (ignored here). */
  correct: boolean | null;
  createdAt: Date;
}

export interface LessonInfo {
  courseId: string;
  lessonId: string;
  title: string;
  skillNames: string[];
  /** Graded activities in lesson order. */
  activities: { activityId: string; prompt: string }[];
}

export interface DiagnosticRecord {
  courseId: string;
  courseTitle: string;
  completedAt: Date;
  /** Answered-and-wrong questions per lesson (skipped questions are not mistakes). */
  wrongByLesson: Map<string, number>;
  /** Lessons the diagnostic suggested skimming. */
  skimLessonIds: Set<string>;
}

export interface InterviewRecord {
  questionId: string;
  prompt: string;
  skillName: string;
  attemptedAt: Date;
  missing: { label: string; courseId: string | null; lessonId: string | null }[];
}

export interface RevisionInput {
  now: Date;
  attempts: AttemptRecord[];
  lessons: Map<string, LessonInfo>;
  completions: { courseId: string; lessonId: string; completedAt: Date }[];
  diagnostics: DiagnosticRecord[];
  interviews: InterviewRecord[];
}

export const lessonKey = (courseId: string, lessonId: string) => `${courseId}/${lessonId}`;

interface ActivityState {
  activityId: string;
  courseId: string;
  lessonId: string;
  attempts: number;
  incorrect: number;
  mistakeSessions: number;
  status: 'DUE' | 'SCHEDULED' | 'RESOLVED' | 'NEVER_WRONG';
  dueAt: Date | null;
  lastAttemptAt: Date;
  lastMistakeAt: Date | null;
  correctedInSession: boolean;
  cleanSessions: number;
}

/** Splits one activity's attempts (oldest first) into sessions. */
function sessions(attempts: AttemptRecord[]): AttemptRecord[][] {
  const result: AttemptRecord[][] = [];
  for (const a of attempts) {
    const current = result.at(-1);
    const last = current?.at(-1);
    if (
      current &&
      last &&
      a.createdAt.getTime() - last.createdAt.getTime() <= SESSION_GAP_MINUTES * 60_000
    )
      current.push(a);
    else result.push([a]);
  }
  return result;
}

/** The scheduling state of one activity from its attempts. */
export function activityState(history: AttemptRecord[], now: Date): ActivityState {
  const ordered = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const groups = sessions(ordered);
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  const base = {
    activityId: first.activityId,
    courseId: first.courseId,
    lessonId: first.lessonId,
    attempts: ordered.length,
    incorrect: ordered.filter((a) => a.correct === false).length,
    mistakeSessions: groups.filter((g) => g.some((a) => a.correct === false)).length,
    lastAttemptAt: last.createdAt,
  };
  const lastMistakeIndex = groups.findLastIndex((g) => g.some((a) => a.correct === false));
  if (lastMistakeIndex < 0)
    return {
      ...base,
      status: 'NEVER_WRONG',
      dueAt: null,
      lastMistakeAt: null,
      correctedInSession: false,
      cleanSessions: 0,
    };

  const mistakeSession = groups[lastMistakeIndex]!;
  const lastMistakeAt = [...mistakeSession].reverse().find((a) => a.correct === false)!.createdAt;
  const correctedInSession = mistakeSession.at(-1)!.correct === true;
  // Later visits that started with a correct answer (recall before seeing feedback).
  const later = groups.slice(lastMistakeIndex + 1);
  const cleanSessions = later.filter((g) => g[0]!.correct === true).length;

  let status: ActivityState['status'];
  let dueAt: Date | null;
  if (cleanSessions >= CLEAN_SESSIONS_TO_RESOLVE) {
    status = 'RESOLVED';
    dueAt = null;
  } else if (cleanSessions === 1) {
    dueAt = new Date(
      later
        .filter((g) => g[0]!.correct === true)
        .at(-1)![0]!
        .createdAt.getTime() +
        ONE_CLEAN_INTERVAL_DAYS * DAY,
    );
    status = dueAt <= now ? 'DUE' : 'SCHEDULED';
  } else if (correctedInSession) {
    dueAt = new Date(mistakeSession.at(-1)!.createdAt.getTime() + CORRECTED_INTERVAL_DAYS * DAY);
    status = dueAt <= now ? 'DUE' : 'SCHEDULED';
  } else {
    status = 'DUE';
    dueAt = lastMistakeAt;
  }
  return { ...base, status, dueAt, lastMistakeAt, correctedInSession, cleanSessions };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

function activityReason(s: ActivityState): string {
  if (s.status === 'SCHEDULED')
    return s.cleanSessions === 1
      ? `Answered correctly first time since your last mistake; one more correct visit after ${day(s.dueAt!)} clears it.`
      : `You corrected this after a mistake; check it again after ${day(s.dueAt!)} to see if it stuck.`;
  if (s.cleanSessions === 1) return 'Due again: one more correct first-try answer clears it.';
  if (s.correctedInSession)
    return 'You corrected this after a mistake; it is due again to check it stuck.';
  return `Your last answer was incorrect${s.mistakeSessions > 1 ? ` (mistakes on ${s.mistakeSessions} separate visits)` : ''}.`;
}

/** Builds the revision queue and the per-activity states (for the dashboard's revision list). */
export function buildRevisionQueue(input: RevisionInput): {
  queue: RevisionQueueResponse;
  dueActivities: { courseId: string; lessonId: string; activityId: string }[];
} {
  const graded = input.attempts.filter((a) => a.correct !== null);
  const byActivity = new Map<string, AttemptRecord[]>();
  for (const a of graded) {
    const key = `${a.courseId}/${a.activityId}`;
    byActivity.set(key, [...(byActivity.get(key) ?? []), a]);
  }
  const states = [...byActivity.values()].map((h) => activityState(h, input.now));
  const stateByActivity = new Map(states.map((s) => [`${s.courseId}/${s.activityId}`, s]));
  const resolvedCount = states.filter((s) => s.status === 'RESOLVED').length;

  const topics: RevisionTopic[] = [];

  // ── Practice topics: one per lesson with due or scheduled activities ──
  const active = states.filter((s) => s.status === 'DUE' || s.status === 'SCHEDULED');
  const byLesson = new Map<string, ActivityState[]>();
  for (const s of active) {
    const key = lessonKey(s.courseId, s.lessonId);
    byLesson.set(key, [...(byLesson.get(key) ?? []), s]);
  }
  for (const [key, list] of byLesson) {
    const lesson = input.lessons.get(key);
    if (!lesson) continue; // retired content
    const prompt = (id: string) => lesson.activities.find((a) => a.activityId === id)?.prompt ?? '';
    const due = list
      .filter((s) => s.status === 'DUE')
      .sort((a, b) => b.mistakeSessions - a.mistakeSessions);
    const scheduled = list.filter((s) => s.status === 'SCHEDULED');
    const inList = new Set(list.map((s) => s.activityId));
    const alternatives = lesson.activities
      .filter((a) => !inList.has(a.activityId))
      .map((a) => ({ a, state: stateByActivity.get(`${lesson.courseId}/${a.activityId}`) }))
      // Never-answered first, then those answered longest ago.
      .sort(
        (x, y) => (x.state?.lastAttemptAt.getTime() ?? 0) - (y.state?.lastAttemptAt.getTime() ?? 0),
      )
      .slice(0, due.length ? Math.max(1, MAX_ALTERNATIVES - due.length) : 0);

    const activities: RevisionActivity[] = [
      ...due.map((s) => ({
        activityId: s.activityId,
        prompt: prompt(s.activityId),
        status: 'DUE' as const,
        dueAt: s.dueAt?.toISOString() ?? null,
        reason: activityReason(s),
      })),
      ...alternatives.map(({ a, state }) => ({
        activityId: a.activityId,
        prompt: a.prompt,
        status: 'ALTERNATIVE' as const,
        dueAt: null,
        reason: state
          ? 'A different question on the same topic that you have not seen recently.'
          : 'A different question on the same topic that you have not tried yet.',
      })),
      ...scheduled.map((s) => ({
        activityId: s.activityId,
        prompt: prompt(s.activityId),
        status: 'SCHEDULED' as const,
        dueAt: s.dueAt?.toISOString() ?? null,
        reason: activityReason(s),
      })),
    ];

    const incorrect = list.reduce((n, s) => n + s.incorrect, 0);
    const mistakeSessions = list.reduce((n, s) => n + s.mistakeSessions, 0);
    const isDue = due.length > 0;
    const nextDue =
      scheduled.map((s) => s.dueAt!).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    let reason = isDue
      ? `You answered ${plural(list.length, 'question')} in this lesson incorrectly (${plural(incorrect, 'incorrect attempt')} across ${plural(mistakeSessions, 'visit')}).`
      : `You have corrected your mistakes here; ${plural(scheduled.length, 'question')} ${scheduled.length === 1 ? 'comes' : 'come'} back after ${day(nextDue!)} to check they stuck.`;
    const skimmed = input.diagnostics.find(
      (d) => d.courseId === lesson.courseId && d.skimLessonIds.has(lesson.lessonId),
    );
    if (
      isDue &&
      skimmed &&
      list.some((s) => s.lastMistakeAt && s.lastMistakeAt > skimmed.completedAt)
    )
      reason +=
        ' Your diagnostic suggested skimming this lesson, but these mistakes came later, so a quick review is worthwhile.';

    topics.push({
      key: `lesson:${lesson.courseId}:${lesson.lessonId}`,
      kind: 'PRACTICE',
      title: lesson.title,
      courseId: lesson.courseId,
      lessonId: lesson.lessonId,
      interviewQuestionId: null,
      skillNames: lesson.skillNames,
      reason,
      due: isDue,
      dueAt: isDue ? null : (nextDue?.toISOString() ?? null),
      mistakeSessions,
      activities,
    });
  }

  // ── Diagnostic topics: lessons with answered-but-wrong diagnostic questions, not yet revisited ──
  for (const d of input.diagnostics) {
    for (const [lessonId, wrong] of d.wrongByLesson) {
      if (wrong === 0) continue;
      const key = lessonKey(d.courseId, lessonId);
      const lesson = input.lessons.get(key);
      if (!lesson || byLesson.has(key)) continue;
      const revisited =
        input.completions.some(
          (c) =>
            c.courseId === d.courseId && c.lessonId === lessonId && c.completedAt > d.completedAt,
        ) ||
        graded.some(
          (a) =>
            a.courseId === d.courseId &&
            a.lessonId === lessonId &&
            a.createdAt > d.completedAt &&
            a.correct === true,
        );
      if (revisited) continue;
      topics.push({
        key: `diagnostic:${d.courseId}:${lessonId}`,
        kind: 'DIAGNOSTIC',
        title: lesson.title,
        courseId: d.courseId,
        lessonId,
        interviewQuestionId: null,
        skillNames: lesson.skillNames,
        reason: `In your ${d.courseTitle} diagnostic on ${day(d.completedAt)} you answered ${plural(wrong, 'question')} on this topic incorrectly. Study the lesson and try its practice questions.`,
        due: true,
        dueAt: null,
        mistakeSessions: 1,
        activities: lesson.activities.slice(0, MAX_ALTERNATIVES).map((a) => ({
          activityId: a.activityId,
          prompt: a.prompt,
          status: 'ALTERNATIVE' as const,
          dueAt: null,
          reason: 'A practice question on the topic the diagnostic flagged.',
        })),
      });
    }
  }

  // ── Interview topics: concepts missing from the latest answer to each question ──
  for (const i of input.interviews) {
    if (!i.missing.length) continue;
    const linked = i.missing.find((m) => m.courseId && m.lessonId);
    const lesson = linked
      ? input.lessons.get(lessonKey(linked.courseId!, linked.lessonId!))
      : undefined;
    topics.push({
      key: `interview:${i.questionId}`,
      kind: 'INTERVIEW',
      title: i.prompt,
      courseId: lesson?.courseId ?? null,
      lessonId: lesson?.lessonId ?? null,
      interviewQuestionId: i.questionId,
      skillNames: [i.skillName],
      reason: `Your latest answer (${day(i.attemptedAt)}) did not mention: ${i.missing.map((m) => m.label.toLowerCase()).join('; ')}.`,
      due: true,
      dueAt: null,
      mistakeSessions: 1,
      activities: (lesson?.activities ?? []).slice(0, 2).map((a) => ({
        activityId: a.activityId,
        prompt: a.prompt,
        status: 'ALTERNATIVE' as const,
        dueAt: null,
        reason: 'A practice question from the lesson that teaches the missing concept.',
      })),
    });
  }

  const kindOrder = { PRACTICE: 0, DIAGNOSTIC: 1, INTERVIEW: 2 } as const;
  topics.sort((a, b) =>
    a.due !== b.due
      ? a.due
        ? -1
        : 1
      : a.due
        ? b.mistakeSessions - a.mistakeSessions ||
          kindOrder[a.kind] - kindOrder[b.kind] ||
          a.title.localeCompare(b.title)
        : (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
  );

  return {
    queue: {
      topics,
      dueCount: topics.filter((t) => t.due).length,
      scheduledCount: topics.filter((t) => !t.due).length,
      resolvedCount,
      method: REVISION_METHOD,
    },
    dueActivities: states
      .filter((s) => s.status === 'DUE' && input.lessons.has(lessonKey(s.courseId, s.lessonId)))
      .map((s) => ({ courseId: s.courseId, lessonId: s.lessonId, activityId: s.activityId })),
  };
}
