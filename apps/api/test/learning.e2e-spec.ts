import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type {
  ActivityAttemptResult,
  CourseCatalogueResponse,
  CourseDetail,
  CourseProgress,
  DiagnosticAssessment,
  DiagnosticResult,
  LearningDashboard,
  LearningRecommendationResponse,
  SkillDemandReport,
} from '@job-assist/shared';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_CONTENT, ANGULAR_JOB, createReviewedResume } from './support/job-fixtures.js';

const SQL = 'sql-fundamentals';

describe('Learn & Prepare (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Learner');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('catalogue', () => {
    it('requires authentication', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/learning/courses').expect(401);
      await request(server).get(`/api/v1/learning/courses/${SQL}`).expect(401);
      await request(server).get('/api/v1/learning/dashboard').expect(401);
      await request(server)
        .post('/api/v1/learning/recommendations')
        .send({ role: 'QA_TESTER' })
        .expect(401);
    });

    it('searches and filters courses', async () => {
      const all = (await user.get('/learning/courses').expect(200)).body as CourseCatalogueResponse;
      expect(all.courses.length).toBeGreaterThan(10);
      expect(all.courses[0]).not.toHaveProperty('modules');

      const search = (await user.get('/learning/courses?q=sql&status=PUBLISHED').expect(200))
        .body as CourseCatalogueResponse;
      expect(search.courses.map((c) => c.id)).toContain(SQL);

      const ai = (
        await user.get('/learning/courses?category=AI_AND_MACHINE_LEARNING&status=PUBLISHED')
      ).body as CourseCatalogueResponse;
      expect(ai.courses.map((c) => c.id)).toEqual(['generative-ai-fundamentals']);

      const none = (await user.get('/learning/courses?q=underwater%20basket%20weaving').expect(200))
        .body as CourseCatalogueResponse;
      expect(none.courses).toEqual([]);
    });

    it('rejects unsupported filters', async () => {
      const res = await user.get('/learning/courses?category=ASTROLOGY').expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      await user.get('/learning/courses?skill=Not_A_Slug').expect(400);
      await user.get('/learning/courses?sort=title').expect(400);
      await user.get(`/learning/courses?q=${'x'.repeat(101)}`).expect(400);
    });

    it('returns ordered curriculum with provenance and without answers', async () => {
      const course = (await user.get(`/learning/courses/${SQL}`).expect(200)).body as CourseDetail;
      expect(course.modules.map((m) => m.order)).toEqual(course.modules.map((_, i) => i + 1));
      expect(course.provenance.review.status).toBe('UNREVIEWED');
      const activities = course.modules.flatMap((m) => m.lessons.flatMap((l) => l.activities));
      expect(activities.length).toBeGreaterThan(0);
      const json = JSON.stringify(activities);
      for (const key of [
        '"correct"',
        '"accept"',
        '"feedback"',
        '"commonMistakes"',
        '"explanation"',
      ])
        expect(json).not.toContain(key);
      const resources = course.modules.flatMap((m) => m.lessons.flatMap((l) => l.resources));
      for (const r of resources)
        expect(r).toMatchObject({
          provenance: 'CURATED',
          url: expect.stringMatching(/^https:\/\//),
        });
    });

    it('reports unknown and malformed ids as 404', async () => {
      expect((await user.get('/learning/courses/astronaut').expect(404)).body.code).toBe(
        'NOT_FOUND',
      );
      await user.get('/learning/courses/Not_A_Slug').expect(404);
      await user.get('/learning/courses/frontend-developer/diagnostic').expect(404);
      await user.put('/learning/enrollments/astronaut').expect(404);
      await user.put(`/learning/courses/${SQL}/lessons/js-async/completion`).expect(404);
    });

    it('lists skills and curated role profiles', async () => {
      const skills = (await user.get('/learning/skills').expect(200)).body.skills as {
        id: string;
      }[];
      expect(skills.map((s) => s.id)).toContain('generative-ai');
      const roles = (await user.get('/learning/roles').expect(200)).body.roles as {
        evidence: { kind: string };
      }[];
      expect(roles.every((r) => r.evidence.kind === 'CURATED')).toBe(true);
    });
  });

  describe('selection, lessons and activities', () => {
    it('selects a course and refuses planned ones', async () => {
      const progress = (await user.put(`/learning/enrollments/${SQL}`).expect(200))
        .body as CourseProgress;
      expect(progress).toMatchObject({
        enrolled: true,
        completedLessonIds: [],
        latestDiagnostic: null,
      });
      expect(progress.nextLesson?.lessonId).toBe('sql-select-and-filter');
      await user.put('/learning/enrollments/python-fundamentals').expect(409);

      const dashboard = (await user.get('/learning/dashboard').expect(200))
        .body as LearningDashboard;
      expect(dashboard.courses.map((c) => c.course.id)).toEqual([SQL]);
      expect(dashboard.remainingMinutes).toBe(progress.remainingMinutes);

      await user.delete(`/learning/enrollments/${SQL}`).expect(204);
      expect(((await user.get('/learning/dashboard')).body as LearningDashboard).courses).toEqual(
        [],
      );
    });

    it('grades answers with feedback, records attempts and lists items to revise', async () => {
      const wrong = (
        await user
          .post(`/learning/courses/${SQL}/activities/sql-which-clause-filters/attempts`, {
            answer: { type: 'MULTIPLE_CHOICE', optionId: 'c' },
          })
          .expect(201)
      ).body as ActivityAttemptResult;
      expect(wrong).toMatchObject({
        graded: true,
        correct: false,
        score: 0,
        correctAnswer: 'WHERE',
        attemptNumber: 1,
        feedback: expect.stringContaining('ORDER BY only sorts'),
      });

      let dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(dashboard.revision.map((r) => r.activityId)).toEqual(['sql-which-clause-filters']);

      const right = (
        await user
          .post(`/learning/courses/${SQL}/activities/sql-which-clause-filters/attempts`, {
            answer: { type: 'MULTIPLE_CHOICE', optionId: 'b' },
          })
          .expect(201)
      ).body as ActivityAttemptResult;
      expect(right).toMatchObject({ correct: true, attemptNumber: 2 });
      dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(dashboard.revision).toEqual([]);

      const gaps = (
        await user
          .post(`/learning/courses/${SQL}/activities/sql-fill-left-join/attempts`, {
            answer: {
              type: 'FILL_IN_THE_GAP',
              gaps: { 'join-type': 'left', 'join-keyword': 'USING' },
            },
          })
          .expect(201)
      ).body as ActivityAttemptResult;
      expect(gaps).toMatchObject({ correct: false, score: 0.5 });

      const progress = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(progress.enrolled).toBe(true);
      expect(progress.activities).toContainEqual({
        activityId: 'sql-which-clause-filters',
        lessonId: 'sql-select-and-filter',
        attempts: 2,
        latestCorrect: true,
      });
    });

    it('rejects malformed and mismatched answers', async () => {
      const url = `/learning/courses/${SQL}/activities/sql-which-clause-filters/attempts`;
      expect(
        (await user.post(url, { answer: { type: 'MULTIPLE_CHOICE' } }).expect(400)).body.code,
      ).toBe('VALIDATION_FAILED');
      await user
        .post(url, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'a', extra: 1 } })
        .expect(400);
      await user.post(url, { answer: { type: 'SHORT_ANSWER', text: 'WHERE' } }).expect(400);
      await user.post(url, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'zz' } }).expect(400);
      await user.post(url, { answer: { type: 'SHORT_ANSWER', text: 'x'.repeat(501) } }).expect(400);
      await user
        .post(`/learning/courses/${SQL}/activities/sql-null-cards/attempts`, {
          answer: { type: 'CHECKLIST', checkedItemIds: [] },
        })
        .expect(400);
      await user
        .post(`/learning/courses/${SQL}/activities/js-fill-await/attempts`, {
          answer: { type: 'SHORT_ANSWER', text: 'await' },
        })
        .expect(404);
      expect(await prisma.learningActivityAttempt.count()).toBe(0);
    });

    it('records lesson completion separately and resumes at the next lesson', async () => {
      let progress = (
        await user
          .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
          .expect(200)
      ).body as CourseProgress;
      expect(progress.completedLessonIds).toEqual(['sql-select-and-filter']);
      expect(progress.nextLesson?.lessonId).toBe('sql-nulls-and-sorting');
      // Idempotent.
      await user
        .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      // Completion is not skill evidence.
      expect(await prisma.learningSkillEvidence.count()).toBe(0);

      progress = (
        await user
          .delete(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
          .expect(200)
      ).body as CourseProgress;
      expect(progress.completedLessonIds).toEqual([]);
    });
  });

  describe('diagnostic', () => {
    it('serves questions without answers, scores them and suggests lessons to skim', async () => {
      const diagnostic = (await user.get(`/learning/courses/${SQL}/diagnostic`).expect(200))
        .body as DiagnosticAssessment;
      expect(JSON.stringify(diagnostic)).not.toContain('"correct"');

      const result = (
        await user
          .post(`/learning/courses/${SQL}/diagnostic/attempts`, {
            answers: [
              { questionId: 'sql-dx-where', optionId: 'a' },
              { questionId: 'sql-dx-null', optionId: 'b' },
              { questionId: 'sql-dx-join', optionId: 'b' },
            ],
          })
          .expect(201)
      ).body as DiagnosticResult;
      expect(result).toMatchObject({ score: 2, maxScore: diagnostic.questions.length });
      const topic = (lessonId: string) => result.topics.find((t) => t.lessonId === lessonId)!;
      expect(topic('sql-select-and-filter').recommendation).toBe('SKIM');
      expect(topic('sql-nulls-and-sorting').recommendation).toBe('STUDY');
      expect(topic('sql-aggregation').recommendation).toBe('STUDY'); // unanswered
      expect(result.questions.find((q) => q.questionId === 'sql-dx-null')).toMatchObject({
        correct: false,
        correctOptionId: 'c',
      });

      const progress = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(progress.latestDiagnostic?.attemptId).toBe(result.attemptId);
      expect(progress.skimLessonIds).toEqual(
        expect.arrayContaining(['sql-select-and-filter', 'sql-joins']),
      );
      // Lessons the diagnostic suggests skimming are skipped when choosing the next lesson.
      expect(progress.nextLesson?.lessonId).toBe('sql-nulls-and-sorting');

      const dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      expect(dashboard.assessedSkills.map((s) => s.skillId)).toEqual(
        expect.arrayContaining(['sql']),
      );
    });

    it('rejects answers to unknown questions or options', async () => {
      const url = `/learning/courses/${SQL}/diagnostic/attempts`;
      await user
        .post(url, { answers: [{ questionId: 'js-dx-closure', optionId: 'a' }] })
        .expect(400);
      await user
        .post(url, { answers: [{ questionId: 'sql-dx-where', optionId: 'z' }] })
        .expect(400);
      await user
        .post(url, {
          answers: [
            { questionId: 'sql-dx-where', optionId: 'a' },
            { questionId: 'sql-dx-where', optionId: 'b' },
          ],
        })
        .expect(400);
      expect(await prisma.learningAssessmentAttempt.count()).toBe(0);
    });
  });

  describe('recommendations', () => {
    it('recommends courses for a role without a resume', async () => {
      const res = (
        await user.post('/learning/recommendations', { role: 'DATA_ANALYST' }).expect(200)
      ).body as LearningRecommendationResponse;
      expect(res.resume).toBeNull();
      const sql = res.skills.find((s) => s.skillId === 'sql')!;
      expect(sql).toMatchObject({
        coreForRole: true,
        evidenceStrength: 'NONE',
        gap: true,
        proficiency: { level: 'UNKNOWN' },
      });
      expect(sql.nextStep).toMatchObject({ kind: 'START_COURSE', courseId: SQL });
      expect(res.courses.map((c) => c.course.id)).toContain(SQL);
      const python = res.skills.find((s) => s.skillId === 'python')!;
      expect(python.nextStep.kind).toBe('NO_COURSE_YET');
      expect(res.demand).toMatchObject({ source: 'YOUR_ANALYSED_JOBS', jobCount: 0 });
    });

    it('uses resume evidence, assessment results and user corrections — and nothing invented', async () => {
      const { versionId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'Angular CV',
        ANGULAR_CONTENT,
      );
      const res = (
        await user
          .post('/learning/recommendations', {
            role: 'FRONTEND_DEVELOPER',
            resumeVersionId: versionId,
            corrections: [{ skillId: 'css', status: 'HAS_SKILL' }],
          })
          .expect(200)
      ).body as LearningRecommendationResponse;
      expect(res.resume).toMatchObject({ resumeName: 'Angular CV' });
      const skill = (id: string) => res.skills.find((s) => s.skillId === id)!;

      // Used in experience: APPLIED, but proficiency is still unknown.
      expect(skill('typescript')).toMatchObject({
        evidenceStrength: 'APPLIED',
        proficiency: { level: 'UNKNOWN', source: 'NONE' },
        confidence: 'MEDIUM',
        gap: false,
      });
      expect(skill('typescript').resumeEvidence).toContainEqual(
        expect.objectContaining({ kind: 'EXPERIENCE', context: 'Frontend Developer at Acme' }),
      );
      // Not in the resume: a gap, low confidence.
      expect(skill('javascript')).toMatchObject({
        evidenceStrength: 'NONE',
        gap: true,
        confidence: 'LOW',
      });
      // User correction is respected.
      expect(skill('css')).toMatchObject({ userCorrection: 'HAS_SKILL', gap: false });
      // A non-core skill with resume evidence is shown but is not a gap.
      expect(skill('angular')).toMatchObject({ coreForRole: false, gap: false });
      expect(res.courses[0]?.order).toBe(1);

      // After a diagnostic, proficiency comes from the assessment.
      const diagnostic = (await user.get('/learning/courses/javascript-essentials/diagnostic'))
        .body as DiagnosticAssessment;
      const correct: Record<string, string> = {
        'js-dx-coercion': 'b',
        'js-dx-closure': 'c',
        'js-dx-filter-map': 'a',
        'js-dx-event-loop': 'b',
        'js-dx-optional-chaining': 'b',
      };
      await user
        .post('/learning/courses/javascript-essentials/diagnostic/attempts', {
          answers: diagnostic.questions.map((q) => ({ questionId: q.id, optionId: correct[q.id] })),
        })
        .expect(201);
      const after = (
        await user
          .post('/learning/recommendations', {
            role: 'FRONTEND_DEVELOPER',
            resumeVersionId: versionId,
          })
          .expect(200)
      ).body as LearningRecommendationResponse;
      expect(after.skills.find((s) => s.skillId === 'javascript')).toMatchObject({
        proficiency: { level: 'FOUNDATIONS_DEMONSTRATED', source: 'ASSESSMENT' },
        confidence: 'HIGH',
        gap: false,
      });
    });

    it('never reads another user’s resume', async () => {
      const { versionId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'Private CV',
        ANGULAR_CONTENT,
      );
      const other = await signUp(app, 'Someone else');
      const res = await other
        .post('/learning/recommendations', {
          role: 'FRONTEND_DEVELOPER',
          resumeVersionId: versionId,
        })
        .expect(404);
      expect(JSON.stringify(res.body)).not.toMatch(/Angular|Acme|Private CV/);
      // Progress is per user too.
      await user.put(`/learning/enrollments/${SQL}`).expect(200);
      expect(((await other.get('/learning/dashboard')).body as LearningDashboard).courses).toEqual(
        [],
      );
    });

    it('validates the request', async () => {
      await user.post('/learning/recommendations', { role: 'ASTRONAUT' }).expect(400);
      await user
        .post('/learning/recommendations', { role: 'QA_TESTER', resumeVersionId: 'nope' })
        .expect(400);
      await user
        .post('/learning/recommendations', {
          role: 'QA_TESTER',
          corrections: [{ skillId: 'astrology', status: 'HAS_SKILL' }],
        })
        .expect(400);
      await user
        .post('/learning/recommendations', { role: 'QA_TESTER', userId: user.userId })
        .expect(400);
    });

    it('reports observed skill demand from the user’s own analysed jobs only', async () => {
      const job = (await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string };
      await user.post(`/jobs/${job.id}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();

      const demand = (await user.get('/learning/skill-demand?role=FRONTEND_DEVELOPER').expect(200))
        .body as SkillDemandReport;
      expect(demand).toMatchObject({
        source: 'YOUR_ANALYSED_JOBS',
        role: 'FRONTEND_DEVELOPER',
        jobCount: 1,
        excludedSampleJobs: 0,
      });
      const typescript = demand.skills.find((s) => s.skillId === 'typescript');
      expect(typescript).toMatchObject({ postings: 1 });
      expect(demand.observedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const qa = (await user.get('/learning/skill-demand?role=QA_TESTER').expect(200))
        .body as SkillDemandReport;
      expect(qa.jobCount).toBe(0);
      const other = await signUp(app, 'Other');
      expect(
        ((await other.get('/learning/skill-demand').expect(200)).body as SkillDemandReport)
          .jobCount,
      ).toBe(0);
    });
  });

  describe('reliability and ownership', () => {
    const MC = `/learning/courses/${SQL}/activities/sql-which-clause-filters/attempts`;

    it('rejects blank and unexpected answers without recording anything', async () => {
      const short = `/learning/courses/${SQL}/activities/sql-count-berlin-onsite/attempts`;
      const blank = await user
        .post(short, { answer: { type: 'SHORT_ANSWER', text: '   ' } })
        .expect(400);
      expect(blank.body.message).toMatch(/Enter an answer/);
      await user
        .post(`/learning/courses/${SQL}/activities/sql-fill-left-join/attempts`, {
          answer: { type: 'FILL_IN_THE_GAP', gaps: { 'join-type': '', 'join-keyword': ' ' } },
        })
        .expect(400);
      expect(
        (await user.post(MC, { answer: { type: 'CODE', source: 'rm -rf /' } }).expect(400)).body
          .code,
      ).toBe('VALIDATION_FAILED');
      await user.post(MC, { answer: 'b' }).expect(400);
      await user.post(MC, {}).expect(400);
      expect(await prisma.learningActivityAttempt.count()).toBe(0);
      expect(await prisma.learningEnrollment.count()).toBe(0);
    });

    it('keeps every attempt and numbers repeated submissions in order', async () => {
      const results: ActivityAttemptResult[] = [];
      for (const optionId of ['a', 'a', 'b'])
        results.push(
          (await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId } }).expect(201)).body,
        );
      expect(results.map((r) => r.attemptNumber)).toEqual([1, 2, 3]);
      expect(results.map((r) => r.correct)).toEqual([false, false, true]);
      const progress = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(progress.activities).toEqual([
        {
          activityId: 'sql-which-clause-filters',
          lessonId: 'sql-select-and-filter',
          attempts: 3,
          latestCorrect: true,
        },
      ]);
    });

    it('retains progress when a completed lesson is revisited and completed again', async () => {
      await user
        .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'b' } }).expect(201);
      // Revisit: read the course and progress again, then complete it once more.
      await user.get(`/learning/courses/${SQL}`).expect(200);
      await user
        .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      const progress = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(progress.completedLessonIds).toEqual(['sql-select-and-filter']);
      expect(progress.activities[0]).toMatchObject({ attempts: 1, latestCorrect: true });
      expect(await prisma.learningLessonCompletion.count()).toBe(1);
      expect(await prisma.learningEnrollment.count()).toBe(1);
    });

    it('never shows or changes another user’s learning records', async () => {
      const other = await signUp(app, 'Other learner');
      await user
        .put(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      await user.post(MC, { answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' } }).expect(201);
      await user
        .post(`/learning/courses/${SQL}/diagnostic/attempts`, {
          answers: [{ questionId: 'sql-dx-where', optionId: 'a' }],
        })
        .expect(201);

      const theirs = (await other.get(`/learning/courses/${SQL}/progress`).expect(200))
        .body as CourseProgress;
      expect(theirs).toMatchObject({
        enrolled: false,
        completedLessonIds: [],
        activities: [],
        latestDiagnostic: null,
      });
      const theirDashboard = (await other.get('/learning/dashboard')).body as LearningDashboard;
      expect(theirDashboard).toMatchObject({ courses: [], revision: [], assessedSkills: [] });

      // The other user's own actions only touch their own rows.
      await other
        .delete(`/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`)
        .expect(200);
      await other.delete(`/learning/enrollments/${SQL}`).expect(204);
      const mine = (await user.get(`/learning/courses/${SQL}/progress`)).body as CourseProgress;
      expect(mine).toMatchObject({ enrolled: true, completedLessonIds: ['sql-select-and-filter'] });
      expect(mine.latestDiagnostic).not.toBeNull();
    });

    it('requires authentication for every learner action', async () => {
      const server = app.getHttpServer();
      const calls = [
        () => request(server).put(`/api/v1/learning/enrollments/${SQL}`),
        () => request(server).get(`/api/v1/learning/courses/${SQL}/progress`),
        () =>
          request(server).put(
            `/api/v1/learning/courses/${SQL}/lessons/sql-select-and-filter/completion`,
          ),
        () =>
          request(server)
            .post(`/api/v1${MC}`)
            .send({ answer: { type: 'MULTIPLE_CHOICE', optionId: 'b' } }),
        () =>
          request(server)
            .post(`/api/v1/learning/courses/${SQL}/diagnostic/attempts`)
            .send({ answers: [] }),
        () => request(server).get('/api/v1/learning/skill-demand'),
      ];
      for (const call of calls) await call().expect(401);
    });

    it('does not treat one or two diagnostic questions as a measured skill', async () => {
      const diagnostic = (await user.get(`/learning/courses/${SQL}/diagnostic`))
        .body as DiagnosticAssessment;
      const correct: Record<string, string> = {
        'sql-dx-where': 'a',
        'sql-dx-null': 'c',
        'sql-dx-join': 'b',
        'sql-dx-having': 'b',
        'sql-dx-unique': 'b',
        'sql-dx-injection': 'c',
      };
      await user
        .post(`/learning/courses/${SQL}/diagnostic/attempts`, {
          answers: diagnostic.questions.map((q) => ({ questionId: q.id, optionId: correct[q.id] })),
        })
        .expect(201);

      const dashboard = (await user.get('/learning/dashboard')).body as LearningDashboard;
      const assessed = (id: string) => dashboard.assessedSkills.find((s) => s.skillId === id)!;
      expect(assessed('sql')).toMatchObject({ correct: 6, total: 6, sufficient: true });
      expect(assessed('postgresql')).toMatchObject({ correct: 1, total: 1, sufficient: false });

      const plan = (
        await user.post('/learning/recommendations', { role: 'BACKEND_DEVELOPER' }).expect(200)
      ).body as LearningRecommendationResponse;
      const skill = (id: string) => plan.skills.find((s) => s.skillId === id)!;
      expect(skill('sql')).toMatchObject({
        basis: 'MEASURED',
        confidence: 'HIGH',
        proficiency: { level: 'FOUNDATIONS_DEMONSTRATED', source: 'ASSESSMENT' },
      });
      // data-modelling had a single question: reported, but not measured.
      expect(skill('data-modelling')).toMatchObject({
        basis: 'UNKNOWN',
        proficiency: {
          level: 'UNKNOWN',
          source: 'NONE',
          basis: expect.stringMatching(/too few to measure/),
        },
      });
    });

    it('labels each skill judgement and never changes the resume when skills are corrected', async () => {
      const { resumeId, versionId } = await createReviewedResume(
        user,
        app.get(ParsingDispatcher),
        'Angular CV',
        ANGULAR_CONTENT,
      );
      const before = (await user.get(`/resumes/${resumeId}/versions/${versionId}`).expect(200))
        .body;

      const plan = (
        await user
          .post('/learning/recommendations', {
            role: 'FRONTEND_DEVELOPER',
            resumeVersionId: versionId,
            corrections: [
              { skillId: 'typescript', status: 'LACKS_SKILL' },
              { skillId: 'react', status: 'HAS_SKILL' },
            ],
          })
          .expect(200)
      ).body as LearningRecommendationResponse;
      const skill = (id: string) => plan.skills.find((s) => s.skillId === id)!;
      expect(skill('typescript')).toMatchObject({
        basis: 'USER_CORRECTED',
        userCorrection: 'LACKS_SKILL',
        gap: true,
      });
      expect(skill('react')).toMatchObject({ basis: 'USER_CORRECTED', gap: false });
      expect(skill('angular')).toMatchObject({ basis: 'RESUME_EVIDENCE' });
      expect(skill('javascript')).toMatchObject({ basis: 'UNKNOWN' });

      const after = (await user.get(`/resumes/${resumeId}/versions/${versionId}`).expect(200)).body;
      expect(after.content).toEqual(before.content);
      expect(after.updatedAt).toBe(before.updatedAt);
      // Corrections are not stored anywhere: a new request starts from the evidence again.
      const again = (
        await user
          .post('/learning/recommendations', {
            role: 'FRONTEND_DEVELOPER',
            resumeVersionId: versionId,
          })
          .expect(200)
      ).body as LearningRecommendationResponse;
      expect(again.skills.find((s) => s.skillId === 'typescript')).toMatchObject({
        basis: 'RESUME_EVIDENCE',
        userCorrection: null,
      });
    });
  });
});
