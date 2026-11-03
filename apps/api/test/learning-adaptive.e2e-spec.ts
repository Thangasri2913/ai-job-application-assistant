import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type {
  CourseProgress,
  LearningDashboard,
  LearningPreferences,
  NextStepsResponse,
  RevisionQueueResponse,
} from '@job-assist/shared';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_JOB, createReviewedResume, REACT_CONTENT } from './support/job-fixtures.js';

const SQL = 'sql-fundamentals';
const MC = `/learning/courses/${SQL}/activities/sql-which-clause-filters/attempts`;
const PREFS = {
  targetRole: 'DATA_ANALYST',
  interestCategories: ['AI_AND_MACHINE_LEARNING'],
  interestSkillIds: ['sql'],
  weeklyGoalMinutes: 120,
};

describe('Learn & Prepare adaptive learning (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Adaptive learner');
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication for every adaptive route', async () => {
    const server = app.getHttpServer();
    const calls = [
      () => request(server).get('/api/v1/learning/next-steps'),
      () => request(server).get('/api/v1/learning/revision'),
      () => request(server).get('/api/v1/learning/preferences'),
      () => request(server).put('/api/v1/learning/preferences').send(PREFS),
      () =>
        request(server)
          .post('/api/v1/learning/next-steps/dismissals')
          .send({ key: 'start:preferences' }),
      () => request(server).delete('/api/v1/learning/next-steps/dismissals'),
    ];
    for (const call of calls) await call().expect(401);
  });

  it('gives a new user without a resume or role a general start, an empty revision list and empty analytics', async () => {
    const next = (await user.get('/learning/next-steps').expect(200)).body as NextStepsResponse;
    expect(next.steps.map((s) => s.key)).toEqual([
      'start:javascript-essentials',
      'start:preferences',
    ]);
    expect(next.steps.every((s) => s.confidence === 'LOW')).toBe(true);
    expect(next.basedOn).toEqual({
      targetRole: null,
      interests: 0,
      hasResume: false,
      analysedJobs: 0,
      practiceAnswers: 0,
      diagnostics: 0,
    });

    const revision = (await user.get('/learning/revision').expect(200))
      .body as RevisionQueueResponse;
    expect(revision).toMatchObject({ topics: [], dueCount: 0, scheduledCount: 0 });
    expect(revision.method).toContain('not counted as repeated mistakes');

    const { analytics, readiness } = (await user.get('/learning/dashboard').expect(200))
      .body as LearningDashboard;
    expect(analytics).toMatchObject({
      courses: { started: 0, completed: 0 },
      lessonsCompleted: 0,
      practice: { attempts: 0, firstTryAccuracy: null },
      plan: null,
      skills: { measured: 0, tooFewQuestions: 0, unknown: 0 },
    });
    expect(readiness.nextAction).toMatchObject({
      kind: 'START_HERE',
      title: 'Start with JavaScript essentials',
    });
  });

  describe('preferences', () => {
    it('saves, reads back and replaces preferences idempotently', async () => {
      expect((await user.get('/learning/preferences').expect(200)).body).toMatchObject({
        targetRole: null,
        updatedAt: null,
      });
      const saved = (await user.put('/learning/preferences', PREFS).expect(200))
        .body as LearningPreferences;
      expect(saved).toMatchObject({ ...PREFS, dismissedSteps: [] });
      await user.put('/learning/preferences', PREFS).expect(200);
      expect(await prisma.learningPreferences.count()).toBe(1);

      // Clearing the role is allowed: a target role is never required.
      const cleared = (
        await user
          .put('/learning/preferences', { ...PREFS, targetRole: null, weeklyGoalMinutes: null })
          .expect(200)
      ).body as LearningPreferences;
      expect(cleared).toMatchObject({
        targetRole: null,
        weeklyGoalMinutes: null,
        interestSkillIds: ['sql'],
      });
    });

    it('validates preferences on the server', async () => {
      await user.put('/learning/preferences', { ...PREFS, targetRole: 'ASTRONAUT' }).expect(400);
      await user.put('/learning/preferences', { ...PREFS, weeklyGoalMinutes: 45 }).expect(400);
      await user
        .put('/learning/preferences', { ...PREFS, interestCategories: ['COOKING'] })
        .expect(400);
      expect(
        (
          await user
            .put('/learning/preferences', { ...PREFS, interestSkillIds: ['astrology'] })
            .expect(400)
        ).body.message,
      ).toMatch(/Unknown skill/);
      await user.put('/learning/preferences', { ...PREFS, userId: user.userId }).expect(400);
      await user.put('/learning/preferences', { targetRole: null }).expect(400);
      expect(await prisma.learningPreferences.count()).toBe(0);
    });

    it('uses the target role, interests and default resume to explain suggestions', async () => {
      const { resumeId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'React CV',
        REACT_CONTENT,
      );
      await user.post(`/resumes/${resumeId}/default`).expect(200);
      await user
        .put('/learning/preferences', { ...PREFS, targetRole: 'FRONTEND_DEVELOPER' })
        .expect(200);

      const next = (await user.get('/learning/next-steps').expect(200)).body as NextStepsResponse;
      expect(next.basedOn).toMatchObject({
        targetRole: 'FRONTEND_DEVELOPER',
        hasResume: true,
        interests: 2,
      });
      const role = next.steps.filter((s) => s.kind === 'PRACTISE_ROLE_SKILL');
      expect(role.length).toBeGreaterThan(0);
      expect(role[0]!.reason).toMatch(/is a core skill for Frontend Developer, your target role/);
      expect(
        next.steps.some(
          (s) => s.kind === 'EXPLORE_INTEREST' && s.reason.startsWith('Matches your interest'),
        ),
      ).toBe(true);

      const { analytics } = (await user.get('/learning/dashboard').expect(200))
        .body as LearningDashboard;
      expect(analytics.plan).toMatchObject({
        role: 'FRONTEND_DEVELOPER',
        measured: 0,
        demonstrated: 0,
      });
      expect(analytics.plan!.coreSkills).toBeGreaterThan(0);
      expect(analytics.week.goalMinutes).toBe(120);
    });
  });

  describe('revision', () => {
    it('puts a wrong answer in the revision list, schedules it after a correction and keeps every attempt', async () => {
      await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }).expect(201);
      let revision = (await user.get('/learning/revision').expect(200))
        .body as RevisionQueueResponse;
      expect(revision.dueCount).toBe(1);
      expect(revision.topics[0]).toMatchObject({
        key: `lesson:${SQL}:sql-select-and-filter`,
        due: true,
      });
      expect(revision.topics[0]!.activities[0]).toMatchObject({
        activityId: 'sql-which-clause-filters',
        status: 'DUE',
      });
      // Alternatives are different questions from the same lesson.
      expect(
        revision.topics[0]!.activities.slice(1).every(
          (a) => a.status === 'ALTERNATIVE' && a.activityId !== 'sql-which-clause-filters',
        ),
      ).toBe(true);

      let next = (await user.get('/learning/next-steps').expect(200)).body as NextStepsResponse;
      expect(next.steps[0]).toMatchObject({ kind: 'REVISE_TOPIC', confidence: 'MEDIUM' });
      expect(next.steps[0]!.reason).toContain('You answered 1 question in this lesson incorrectly');
      let dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(dashboard.revision.map((r) => r.activityId)).toEqual(['sql-which-clause-filters']);

      // Corrected straight away: no longer due, scheduled for tomorrow.
      await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'b' } }).expect(201);
      revision = (await user.get('/learning/revision').expect(200)).body as RevisionQueueResponse;
      expect(revision).toMatchObject({ dueCount: 0, scheduledCount: 1 });
      expect(revision.topics[0]!.reason).toMatch(/come[s]? back after/);
      next = (await user.get('/learning/next-steps').expect(200)).body as NextStepsResponse;
      expect(next.steps.some((s) => s.kind === 'REVISE_TOPIC')).toBe(false);
      dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(dashboard.revision).toEqual([]);
      expect(dashboard.analytics.revision).toEqual({ due: 0, scheduled: 1 });
      expect(await prisma.learningActivityAttempt.count()).toBe(2);
    });

    it('turns repeated mistakes on separate visits into higher-confidence revision', async () => {
      const lesson = {
        courseId: SQL,
        lessonId: 'sql-select-and-filter',
        activityId: 'sql-which-clause-filters',
        answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
      };
      const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.learningActivityAttempt.create({
        data: { userId: user.userId, ...lesson, correct: false, score: 0, createdAt: old },
      });
      await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'c' } }).expect(201);
      const revision = (await user.get('/learning/revision').expect(200))
        .body as RevisionQueueResponse;
      expect(revision.topics[0]).toMatchObject({ due: true, mistakeSessions: 2 });
      const next = (await user.get('/learning/next-steps').expect(200)).body as NextStepsResponse;
      expect(next.steps[0]).toMatchObject({ kind: 'REVISE_TOPIC', confidence: 'HIGH' });
    });

    it('adds diagnostic topics for answered-wrong questions but not for skipped ones', async () => {
      await user
        .post(`/learning/courses/${SQL}/diagnostic/attempts`, {
          answers: [
            { questionId: 'sql-dx-where', optionId: 'a' },
            { questionId: 'sql-dx-join', optionId: 'a' },
          ],
        })
        .expect(201);
      const revision = (await user.get('/learning/revision').expect(200))
        .body as RevisionQueueResponse;
      expect(revision.topics.map((t) => [t.kind, t.lessonId])).toEqual([
        ['DIAGNOSTIC', 'sql-joins'],
      ]);
      expect(revision.topics[0]!.reason).toMatch(
        /you answered 1 question on this topic incorrectly/,
      );
    });
  });

  describe('next steps', () => {
    it('lets the user dismiss a suggestion and restore dismissed ones', async () => {
      const before = (await user.get('/learning/next-steps')).body as NextStepsResponse;
      const key = before.steps[0]!.key;
      const prefs = (await user.post('/learning/next-steps/dismissals', { key }).expect(200))
        .body as LearningPreferences;
      expect(prefs.dismissedSteps.map((d) => d.key)).toEqual([key]);
      await user.post('/learning/next-steps/dismissals', { key }).expect(200); // idempotent
      const after = (await user.get('/learning/next-steps')).body as NextStepsResponse;
      expect(after.steps.some((s) => s.key === key)).toBe(false);
      expect(after.dismissedCount).toBe(1);

      await user.post('/learning/next-steps/dismissals', { key: 'not a key!' }).expect(400);
      await user.delete('/learning/next-steps/dismissals').expect(200);
      expect(
        ((await user.get('/learning/next-steps')).body as NextStepsResponse).steps[0]!.key,
      ).toBe(key);
    });

    it('explains the next lesson after its prerequisite lesson is completed, and keeps progress intact', async () => {
      await user
        .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      await user.put('/learning/preferences', PREFS).expect(200);
      const next = (await user.get('/learning/next-steps')).body as NextStepsResponse;
      const lesson = next.steps.find((s) => s.kind === 'CONTINUE_LESSON')!;
      expect(lesson).toMatchObject({
        href: `/learn/courses/${SQL}/lessons/sql-nulls-and-sorting`,
        confidence: 'HIGH',
      });
      expect(lesson.reason).toBe(
        'You completed "SELECT, WHERE and ORDER BY", the lesson before it in SQL fundamentals.',
      );

      const progress = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(progress.completedLessonIds).toEqual(['sql-select-and-filter']);
      const { analytics } = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(analytics).toMatchObject({
        courses: { started: 1, completed: 0 },
        lessonsCompleted: 1,
      });
      expect(analytics.week.estimatedMinutes).toBe(25);
    });

    it('uses skills from real analysed jobs', async () => {
      const job = (await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
      await user.post(`/jobs/${job.id}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();
      const next = (await user.get('/learning/next-steps')).body as NextStepsResponse;
      expect(next.basedOn.analysedJobs).toBe(1);
      const jobStep = next.steps.find((s) => s.kind === 'PRACTISE_JOB_SKILL')!;
      expect(jobStep.reason).toMatch(/appears in 1 job you analysed \(\d+ as required\)\./);
      expect(jobStep.confidence).toBe('LOW');
    });
  });

  it('keeps preferences, dismissals and revision separate per user', async () => {
    await user.put('/learning/preferences', PREFS).expect(200);
    await user.post('/learning/next-steps/dismissals', { key: 'start:preferences' }).expect(200);
    await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }).expect(201);

    const other = await signUp(app, 'Other learner');
    expect((await other.get('/learning/preferences').expect(200)).body).toMatchObject({
      targetRole: null,
      dismissedSteps: [],
    });
    expect(((await other.get('/learning/revision')).body as RevisionQueueResponse).topics).toEqual(
      [],
    );
    expect(
      ((await other.get('/learning/next-steps')).body as NextStepsResponse).steps.map((s) => s.key),
    ).toContain('start:preferences');

    await other.put('/learning/preferences', { ...PREFS, targetRole: 'QA_TESTER' }).expect(200);
    await other.delete('/learning/next-steps/dismissals').expect(200);
    const mine = (await user.get('/learning/preferences')).body as LearningPreferences;
    expect(mine).toMatchObject({
      targetRole: 'DATA_ANALYST',
      dismissedSteps: [expect.objectContaining({ key: 'start:preferences' })],
    });
  });
});
