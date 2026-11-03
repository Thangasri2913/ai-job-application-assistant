import {
  type AttemptRecord,
  buildRevisionQueue,
  type LessonInfo,
  lessonKey,
  type RevisionInput,
} from './revision.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const at = (iso: string) => new Date(iso);
const minutesBefore = (minutes: number, from = NOW) => new Date(from.getTime() - minutes * 60_000);
const daysBefore = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

const LESSON: LessonInfo = {
  courseId: 'sql-fundamentals',
  lessonId: 'sql-joins',
  title: 'Joins',
  skillNames: ['SQL'],
  activities: [
    { activityId: 'q1', prompt: 'Question 1' },
    { activityId: 'q2', prompt: 'Question 2' },
    { activityId: 'q3', prompt: 'Question 3' },
  ],
};
const OTHER: LessonInfo = {
  ...LESSON,
  lessonId: 'sql-aggregation',
  title: 'GROUP BY and HAVING',
  activities: [{ activityId: 'a1', prompt: 'Aggregate 1' }],
};

const attempt = (
  activityId: string,
  correct: boolean,
  createdAt: Date,
  lesson = LESSON,
): AttemptRecord => ({
  courseId: lesson.courseId,
  lessonId: lesson.lessonId,
  activityId,
  correct,
  createdAt,
});

const input = (overrides: Partial<RevisionInput> = {}): RevisionInput => ({
  now: NOW,
  attempts: [],
  lessons: new Map([
    [lessonKey(LESSON.courseId, LESSON.lessonId), LESSON],
    [lessonKey(OTHER.courseId, OTHER.lessonId), OTHER],
  ]),
  completions: [],
  diagnostics: [],
  interviews: [],
  ...overrides,
});

describe('buildRevisionQueue', () => {
  it('is empty when nothing was answered incorrectly', () => {
    const { queue } = buildRevisionQueue(input({ attempts: [attempt('q1', true, daysBefore(1))] }));
    expect(queue).toMatchObject({ topics: [], dueCount: 0, scheduledCount: 0, resolvedCount: 0 });
  });

  it('makes a wrong answer due now, with a reason from the attempts and alternatives from the same lesson', () => {
    const { queue, dueActivities } = buildRevisionQueue(
      input({ attempts: [attempt('q1', false, daysBefore(1))] }),
    );
    const [topic] = queue.topics;
    expect(topic).toMatchObject({
      key: 'lesson:sql-fundamentals:sql-joins',
      kind: 'PRACTICE',
      due: true,
      mistakeSessions: 1,
    });
    expect(topic!.reason).toBe(
      'You answered 1 question in this lesson incorrectly (1 incorrect attempt across 1 visit).',
    );
    // The due question, then different questions instead of repeating it.
    expect(topic!.activities.map((a) => [a.activityId, a.status])).toEqual([
      ['q1', 'DUE'],
      ['q2', 'ALTERNATIVE'],
      ['q3', 'ALTERNATIVE'],
    ]);
    expect(dueActivities).toEqual([
      { courseId: 'sql-fundamentals', lessonId: 'sql-joins', activityId: 'q1' },
    ]);
  });

  it('counts several quick tries as one visit, so experimenting is not treated as repeated mistakes', () => {
    const start = daysBefore(1);
    const { queue } = buildRevisionQueue(
      input({
        attempts: [
          attempt('q1', false, start),
          attempt('q1', false, minutesBefore(-2, start)),
          attempt('q1', false, minutesBefore(-4, start)),
        ],
      }),
    );
    expect(queue.topics[0]).toMatchObject({ mistakeSessions: 1, due: true });
    expect(queue.topics[0]!.reason).toContain('3 incorrect attempts across 1 visit');
  });

  it('puts repeated mistakes (separate visits) before a single mistake', () => {
    const { queue } = buildRevisionQueue(
      input({
        attempts: [
          attempt('a1', false, daysBefore(1), OTHER),
          attempt('q1', false, daysBefore(3)),
          attempt('q1', false, daysBefore(2)),
        ],
      }),
    );
    expect(queue.topics.map((t) => [t.title, t.mistakeSessions])).toEqual([
      ['Joins', 2],
      ['GROUP BY and HAVING', 1],
    ]);
  });

  it('schedules a corrected mistake for the next day, then clears it after two correct first-try visits', () => {
    const mistake = at('2026-10-19T11:00:00.000Z');
    const corrected = [
      attempt('q1', false, mistake),
      attempt('q1', true, minutesBefore(-1, mistake)),
    ];

    let { queue } = buildRevisionQueue(input({ attempts: corrected }));
    expect(queue.topics[0]).toMatchObject({ due: false, dueAt: '2026-10-20T11:01:00.000Z' });
    expect(queue.topics[0]!.activities[0]).toMatchObject({ status: 'SCHEDULED' });
    expect(queue).toMatchObject({ dueCount: 0, scheduledCount: 1 });

    // A day later it is due again.
    ({ queue } = buildRevisionQueue(
      input({ attempts: corrected, now: at('2026-10-20T12:00:00.000Z') }),
    ));
    expect(queue.topics[0]).toMatchObject({ due: true });

    // One clean visit: back in 3 days. Two clean visits: resolved.
    const oneClean = [...corrected, attempt('q1', true, at('2026-10-20T12:00:00.000Z'))];
    ({ queue } = buildRevisionQueue(
      input({ attempts: oneClean, now: at('2026-10-21T12:00:00.000Z') }),
    ));
    expect(queue.topics[0]).toMatchObject({ due: false, dueAt: '2026-10-23T12:00:00.000Z' });

    const twoClean = [...oneClean, attempt('q1', true, at('2026-10-24T12:00:00.000Z'))];
    ({ queue } = buildRevisionQueue(
      input({ attempts: twoClean, now: at('2026-10-24T13:00:00.000Z') }),
    ));
    expect(queue).toMatchObject({ topics: [], resolvedCount: 1 });
  });

  it('adds diagnostic topics for answered-wrong questions until the lesson is revisited', () => {
    const diagnostic = {
      courseId: 'sql-fundamentals',
      courseTitle: 'SQL fundamentals',
      completedAt: daysBefore(2),
      wrongByLesson: new Map([['sql-aggregation', 1]]),
      skimLessonIds: new Set<string>(),
    };
    let { queue } = buildRevisionQueue(input({ diagnostics: [diagnostic] }));
    expect(queue.topics).toEqual([
      expect.objectContaining({
        key: 'diagnostic:sql-fundamentals:sql-aggregation',
        kind: 'DIAGNOSTIC',
        reason: expect.stringContaining('you answered 1 question on this topic incorrectly'),
      }),
    ]);
    ({ queue } = buildRevisionQueue(
      input({
        diagnostics: [diagnostic],
        completions: [
          { courseId: 'sql-fundamentals', lessonId: 'sql-aggregation', completedAt: daysBefore(1) },
        ],
      }),
    ));
    expect(queue.topics).toEqual([]);
  });

  it('notes conflicting evidence when a lesson the diagnostic said to skim gets later mistakes', () => {
    const { queue } = buildRevisionQueue(
      input({
        attempts: [attempt('q1', false, daysBefore(1))],
        diagnostics: [
          {
            courseId: 'sql-fundamentals',
            courseTitle: 'SQL fundamentals',
            completedAt: daysBefore(5),
            wrongByLesson: new Map(),
            skimLessonIds: new Set(['sql-joins']),
          },
        ],
      }),
    );
    expect(queue.topics[0]!.reason).toContain(
      'Your diagnostic suggested skimming this lesson, but these mistakes came later',
    );
  });

  it('adds interview concepts with practice from the lesson that teaches them', () => {
    const { queue } = buildRevisionQueue(
      input({
        interviews: [
          {
            questionId: 'iq-sql-joins',
            prompt: 'Explain joins',
            skillName: 'SQL',
            attemptedAt: daysBefore(1),
            missing: [
              {
                label: 'Unmatched right-hand columns are NULL',
                courseId: 'sql-fundamentals',
                lessonId: 'sql-joins',
              },
            ],
          },
        ],
      }),
    );
    expect(queue.topics[0]).toMatchObject({
      kind: 'INTERVIEW',
      interviewQuestionId: 'iq-sql-joins',
      lessonId: 'sql-joins',
    });
    expect(queue.topics[0]!.reason).toContain(
      'did not mention: unmatched right-hand columns are null',
    );
    expect(queue.topics[0]!.activities.map((a) => a.activityId)).toEqual(['q1', 'q2']);
  });

  it('ignores attempts on lessons no longer in the catalogue', () => {
    const retired = { ...LESSON, lessonId: 'retired-lesson' };
    const { queue, dueActivities } = buildRevisionQueue(
      input({ attempts: [attempt('old', false, daysBefore(1), retired)] }),
    );
    expect(queue.topics).toEqual([]);
    expect(dueActivities).toEqual([]);
  });
});
