import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAlertScheduler } from '../src/modules/job-discovery/job-alert-scheduler.js';
import { JobSearchDispatcher } from '../src/modules/job-discovery/job-search-dispatcher.js';
import { DevJobSourceAdapter } from '../src/modules/job-discovery/sources/dev-job-source.js';
import { AdzunaJobSourceAdapter } from '../src/modules/job-discovery/sources/adzuna-job-source.js';
import { GreenhouseJobSourceAdapter } from '../src/modules/job-discovery/sources/greenhouse-job-source.js';
import { LeverJobSourceAdapter } from '../src/modules/job-discovery/sources/lever-job-source.js';
import { RemotiveJobSourceAdapter } from '../src/modules/job-discovery/sources/remotive-job-source.js';
import { SampleDataPolicy } from '../src/modules/job-discovery/sample-data-policy.js';
import {
  JOB_SOURCE_ADAPTERS,
  JobSourceAdapter,
  type JobSourceDescriptor,
} from '../src/modules/job-discovery/sources/job-source-adapter.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp, type TestUser } from './support/api-client.js';
import { ANGULAR_CONTENT, createReviewedResume, REACT_CONTENT } from './support/job-fixtures.js';

const ALERT = {
  name: 'Frontend Developer in Bangalore',
  keywords: ['Frontend Developer'],
  locations: ['Bangalore'],
  minimumMatchScore: 75,
  schedule: { type: 'DAILY', time: '08:00', days: [], timezone: 'Asia/Kolkata' },
};

const SECRET = 'provider-secret-token-123';

/** Well-known sites the app does not search: always listed, never enabled. */
const NOT_INTEGRATED = ['linkedin', 'naukri', 'indeed'].map((key) =>
  expect.objectContaining({ key, isEnabled: false, status: 'NOT_INTEGRATED' }),
);

/** A provider that always fails, with a credential-like string in its error. */
class FailingSource extends JobSourceAdapter<never> {
  readonly descriptor: JobSourceDescriptor = {
    key: 'failing-test',
    name: 'Failing test source',
    kind: 'API',
    isDevelopment: false,
    description: 'Test double',
    attribution: null,
    postingOrigin: 'AGGREGATOR',
  };
  isConfigured() {
    return true;
  }
  searchJobs(): Promise<never[]> {
    return Promise.reject(new Error(`401 Unauthorized for api_key=${SECRET}`));
  }
  getJobDetails() {
    return Promise.resolve(null);
  }
  normalizeJob(): never {
    throw new Error('unused');
  }
}

describe('Job discovery and alerts (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let searches: JobSearchDispatcher;
  let user: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    parsing = app.get(ParsingDispatcher);
    searches = app.get(JobSearchDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    user = await signUp(app, 'Thanga Sri');
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAlert(overrides: Record<string, unknown> = {}, as: TestUser = user) {
    return (await as.post('/job-alerts', { ...ALERT, ...overrides }).expect(201)).body as {
      id: string;
      nextRunAt: string;
    };
  }

  /** Run Now and wait for the search to finish; returns the finished run. */
  async function runNow(alertId: string, as: TestUser = user) {
    const started = await as.post(`/job-alerts/${alertId}/run`).expect(202);
    expect(started.body.status).toBe('RUNNING');
    await searches.drain();
    const runs = (await as.get(`/job-alerts/${alertId}/runs`).expect(200)).body;
    return runs.find((r: { id: string }) => r.id === started.body.id);
  }

  const counts = async (userId = user.userId) => ({
    jobs: await prisma.job.count({ where: { userId } }),
    discovered: await prisma.discoveredJob.count({ where: { userId } }),
    recommendations: await prisma.jobRecommendation.count({ where: { userId } }),
    notifications: await prisma.notification.count({ where: { userId } }),
  });

  describe('alerts', () => {
    it('requires authentication', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/job-alerts').expect(401);
      await request(server).get('/api/v1/recommendations').expect(401);
      await request(server).get('/api/v1/notifications').expect(401);
    });

    it('creates, lists, updates and deletes an alert with a time-zone aware schedule', async () => {
      const created = await user.post('/job-alerts', ALERT).expect(201);
      expect(created.body).toMatchObject({
        name: ALERT.name,
        keywords: ['Frontend Developer'],
        locations: ['Bangalore'],
        remotePreference: 'ANY',
        resumeMode: 'BEST_MATCH',
        minimumMatchScore: 75,
        isActive: true,
        schedule: { type: 'DAILY', time: '08:00', days: [], timezone: 'Asia/Kolkata' },
        lastRun: null,
        recommendationCount: 0,
      });
      // 08:00 in Kolkata is 02:30 UTC.
      expect(created.body.nextRunAt).toMatch(/T02:30:00\.000Z$/);

      const list = (await user.get('/job-alerts').expect(200)).body;
      expect(list).toHaveLength(1);

      const paused = await user
        .patch(`/job-alerts/${created.body.id}`, { isActive: false })
        .expect(200);
      expect(paused.body.isActive).toBe(false);
      expect(paused.body.nextRunAt).toBeNull();

      const weekly = await user
        .patch(`/job-alerts/${created.body.id}`, {
          isActive: true,
          schedule: { type: 'WEEKLY', time: '09:00', days: [1], timezone: 'UTC' },
        })
        .expect(200);
      expect(new Date(weekly.body.nextRunAt).getUTCDay()).toBe(1);
      expect(weekly.body.nextRunAt).toMatch(/T09:00:00\.000Z$/);

      await user.delete(`/job-alerts/${created.body.id}`).expect(204);
      await user.get(`/job-alerts/${created.body.id}`).expect(404);
      const audit = await prisma.auditLog.findMany({
        where: { userId: user.userId, action: { in: ['job_alert.created', 'job_alert.deleted'] } },
      });
      expect(audit).toHaveLength(2);
    });

    it('validates input', async () => {
      await user.post('/job-alerts', { ...ALERT, keywords: [] }).expect(400);
      await user.post('/job-alerts', { ...ALERT, keywords: ['  '] }).expect(400);
      await user.post('/job-alerts', { ...ALERT, minimumMatchScore: 101 }).expect(400);
      await user
        .post('/job-alerts', { ...ALERT, schedule: { ...ALERT.schedule, timezone: 'Mars/Base' } })
        .expect(400);
      await user
        .post('/job-alerts', { ...ALERT, schedule: { ...ALERT.schedule, time: '25:00' } })
        .expect(400);
      await user
        .post('/job-alerts', {
          ...ALERT,
          schedule: { ...ALERT.schedule, type: 'WEEKLY', days: [] },
        })
        .expect(400);
      await user
        .post('/job-alerts', {
          ...ALERT,
          schedule: { ...ALERT.schedule, type: 'CUSTOM', days: [] },
        })
        .expect(400);
      await user.post('/job-alerts', { ...ALERT, remotePreference: 'MOON' }).expect(400);
    });

    it('lists the configured sources, flagging development data', async () => {
      const sources = (await user.get('/job-sources').expect(200)).body;
      expect(sources).toEqual([
        expect.objectContaining({
          key: 'dev',
          isDevelopment: true,
          isEnabled: true,
          status: 'ACTIVE',
          postingOrigin: 'SAMPLE',
        }),
        ...NOT_INTEGRATED,
      ]);
      const row = await prisma.jobSource.findUniqueOrThrow({ where: { key: 'dev' } });
      // No credential columns exist; the table holds descriptive data only.
      expect(
        Object.keys(row).some((k) => /secret|token|password|key$/i.test(k) && k !== 'key'),
      ).toBe(false);
    });
  });

  describe('discovery pipeline', () => {
    it('needs a reviewed resume to recommend anything', async () => {
      const alert = await createAlert();
      const run = await runNow(alert.id);
      expect(run.status).toBe('COMPLETED');
      expect(run.jobsFound).toBeGreaterThan(0);
      expect(run.recommendationsCreated).toBe(0);
      expect(run.note).toMatch(/Add and review a resume/);
      expect(await counts()).toMatchObject({ jobs: 0, recommendations: 0, notifications: 0 });
    });

    it('discovers, screens against every resume, recommends above the threshold and notifies once', async () => {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      await createReviewedResume(user, parsing, 'React Resume', REACT_CONTENT);
      const alert = await createAlert();

      const run = await runNow(alert.id);
      expect(run).toMatchObject({ status: 'COMPLETED', trigger: 'MANUAL', errorMessage: null });
      expect(run.sources).toEqual([
        expect.objectContaining({ sourceKey: 'dev', status: 'OK', isDevelopment: true }),
      ]);
      expect(run.recommendationsCreated).toBeGreaterThan(0);
      expect(run.jobsCreated).toBe(run.recommendationsCreated);
      expect(run.jobsFound).toBe(run.jobsCreated + run.jobsSkipped);

      // Criteria: only Bangalore (or remote) postings that mention the keywords were considered.
      const discovered = await prisma.discoveredJob.findMany({ where: { userId: user.userId } });
      expect(discovered.length).toBe(run.jobsFound);
      for (const d of discovered) expect(d.location ?? '').toMatch(/Bangalore|Bengaluru|Remote/);
      expect(discovered.map((d) => d.externalId)).not.toContain('sample-be-java-blr');
      expect(discovered.map((d) => d.externalId)).not.toContain('sample-fe-angular-chennai');

      // Threshold: below-threshold postings are kept internally, never as jobs or recommendations.
      const below = discovered.filter((d) => d.outcome === 'BELOW_THRESHOLD');
      expect(below.length).toBe(run.belowThreshold);
      expect(below.length).toBeGreaterThan(0);
      for (const d of below) {
        expect(d.jobId).toBeNull();
        expect(d.screeningScore ?? 0).toBeLessThan(75);
      }

      const recs = (await user.get('/recommendations').expect(200)).body;
      expect(recs).toHaveLength(run.recommendationsCreated);
      for (const r of recs) {
        expect(r.matchScore).toBeGreaterThanOrEqual(75);
        expect(r.status).toBe('NEW');
        expect(r.reason).toMatch(/match \(\d+%\) with “.+” v\d/);
        expect(r.reason).not.toMatch(/guarantee|hired/i);
        expect(r.job.isSampleData).toBe(true);
        expect(r.source).toEqual({
          key: 'dev',
          name: 'Development sample jobs',
          discoveredFrom: 'Development sample fixtures',
          isDevelopment: true,
          attribution: null,
        });
        expect(r.alert).toEqual({ id: alert.id, name: ALERT.name });
      }
      // Ranked best first.
      const ranks = recs.map((r: { rank: number }) => r.rank);
      expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);

      // The Angular posting is matched against both resumes; the Angular resume wins.
      const angularRec = recs.find((r: { job: { title: string; companyName: string } }) =>
        r.job.companyName.startsWith('Northwind'),
      );
      expect(angularRec.resume).toMatchObject({
        resumeVersionId: angular.versionId,
        resumeName: 'Angular Resume',
        versionNumber: 1,
      });
      expect(angularRec.requiredSkills.matched).toEqual(
        expect.arrayContaining(['Angular', 'TypeScript', 'RxJS']),
      );
      expect(angularRec.reasons[0]).toMatch(/highest of the 2 resumes compared/);

      // The full job analysis ran and is the same one the Job Details page shows.
      const job = (await user.get(`/jobs/${angularRec.job.id}`).expect(200)).body;
      expect(job).toMatchObject({
        origin: 'DISCOVERED',
        isSampleData: true,
        inLibrary: false,
        analysisStatus: 'COMPLETED',
        recommendation: { resumeVersionId: angular.versionId, score: angularRec.matchScore },
      });
      const matches = (await user.get(`/jobs/${angularRec.job.id}/matches`).expect(200)).body;
      expect(matches.resumes).toHaveLength(2);

      // Discovered jobs stay out of the Jobs list until saved.
      expect((await user.get('/jobs').expect(200)).body).toHaveLength(0);

      // One notification for the whole run.
      const notes = (await user.get('/notifications').expect(200)).body;
      expect(notes.unreadCount).toBe(1);
      expect(notes.items[0]).toMatchObject({
        type: 'NEW_RECOMMENDATIONS',
        channel: 'IN_APP',
        title: `${recs.length} new job recommendation${recs.length === 1 ? '' : 's'}`,
        link: `/recommendations?alertId=${alert.id}`,
        readAt: null,
      });

      const dashboard = (await user.get('/dashboard/summary').expect(200)).body;
      expect(dashboard.recommendations.new).toBe(recs.length);
      expect(dashboard.recommendations.strong).toBe(recs.length);
    });

    it('is idempotent: running again creates no duplicate jobs, recommendations or notifications', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const alert = await createAlert();
      const first = await runNow(alert.id);
      const before = await counts();
      expect(before.recommendations).toBeGreaterThan(0);

      const second = await runNow(alert.id);
      expect(second).toMatchObject({
        status: 'COMPLETED',
        jobsFound: first.jobsFound,
        jobsCreated: 0,
        recommendationsCreated: 0,
        jobsSkipped: first.jobsFound,
      });
      expect(await counts()).toEqual(before);

      // A retried run (same run processed twice) changes nothing either.
      const { JobDiscoveryService } =
        await import('../src/modules/job-discovery/job-discovery.service.js');
      await app.get(JobDiscoveryService).processRun(second.id);
      expect(await counts()).toEqual(before);

      // A second alert that finds the same postings doesn't duplicate them.
      const other = await createAlert({ name: 'Angular roles', keywords: ['Angular'] });
      const third = await runNow(other.id);
      expect(third.recommendationsCreated).toBe(0);
      expect((await counts()).jobs).toBe(before.jobs);
      expect((await counts()).recommendations).toBe(before.recommendations);
    });

    it('rejects a concurrent Run Now for the same alert', async () => {
      const alert = await createAlert();
      await user.post(`/job-alerts/${alert.id}/run`).expect(202);
      const conflict = await user.post(`/job-alerts/${alert.id}/run`).expect(409);
      expect(conflict.body.code).toBe('JOB_SEARCH_IN_PROGRESS');
      await searches.drain();
    });

    it('does not recommend a posting the user already added (URL duplicate)', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const manual = await user
        .post('/jobs', {
          title: 'Frontend Engineer',
          companyName: 'Northwind Analytics',
          description:
            'We build analytics dashboards.\n\nRequirements:\n- Experience with Angular and TypeScript\n- Experience integrating REST APIs',
          jobUrl: 'https://www.example.com/dev-job-source/sample-fe-angular-blr?utm_source=mail',
        })
        .expect(201);
      const alert = await createAlert();
      await runNow(alert.id);
      const d = await prisma.discoveredJob.findFirstOrThrow({
        where: { userId: user.userId, externalId: 'sample-fe-angular-blr' },
      });
      expect(d).toMatchObject({ outcome: 'DUPLICATE', jobId: manual.body.id });
      const recs = (await user.get('/recommendations').expect(200)).body;
      expect(recs.map((r: { job: { id: string } }) => r.job.id)).not.toContain(manual.body.id);
    });

    it('applies the threshold: a 100% minimum recommends nothing but keeps discovery records', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const alert = await createAlert({ minimumMatchScore: 100 });
      const run = await runNow(alert.id);
      expect(run.recommendationsCreated).toBe(0);
      expect(run.belowThreshold).toBe(run.jobsFound);
      expect(await counts()).toMatchObject({ jobs: 0, recommendations: 0, notifications: 0 });
      expect((await counts()).discovered).toBe(run.jobsFound);
    });
  });

  describe('recommendations', () => {
    async function setup() {
      const angular = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      // A lower threshold so several postings are recommended.
      const alert = await createAlert({ minimumMatchScore: 50 });
      await runNow(alert.id);
      const recs = (await user.get('/recommendations').expect(200)).body;
      return { angular, alert, recs };
    }

    it('marks viewed, saves into the Jobs list and dismisses permanently', async () => {
      const { alert, recs } = await setup();
      expect(recs.length).toBeGreaterThan(1);
      const [first, second] = recs;

      const viewed = (await user.get(`/recommendations/${first.id}`).expect(200)).body;
      expect(viewed.status).toBe('VIEWED');
      expect(viewed.viewedAt).not.toBeNull();

      const saved = (await user.post(`/recommendations/${first.id}/save`).expect(200)).body;
      expect(saved.status).toBe('SAVED');
      const jobs = (await user.get('/jobs').expect(200)).body;
      expect(jobs.map((j: { id: string }) => j.id)).toEqual([first.job.id]);

      const dismissed = (await user.post(`/recommendations/${second.id}/dismiss`).expect(200)).body;
      expect(dismissed.status).toBe('DISMISSED');
      expect((await user.get('/recommendations').expect(200)).body).toHaveLength(recs.length - 1);
      expect(
        (await user.get('/recommendations?status=DISMISSED').expect(200)).body.map(
          (r: { id: string }) => r.id,
        ),
      ).toEqual([second.id]);

      // Re-running never resurrects a dismissed recommendation.
      await runNow(alert.id);
      const again = await prisma.jobRecommendation.findUniqueOrThrow({ where: { id: second.id } });
      expect(again.status).toBe('DISMISSED');

      const audit = await prisma.auditLog.count({
        where: {
          userId: user.userId,
          action: { in: ['job_recommendation.saved', 'job_recommendation.dismissed'] },
        },
      });
      expect(audit).toBe(2);
    });

    it('creating an application keeps the exact recommended version and marks it APPLIED', async () => {
      const { angular, recs } = await setup();
      const rec = recs.find(
        (r: { resume: { resumeVersionId: string } }) =>
          r.resume.resumeVersionId === angular.versionId,
      );
      const application = await user
        .post('/applications', { jobId: rec.job.id, resumeVersionId: rec.resume.resumeVersionId })
        .expect(201);
      expect(application.body.resume.resumeVersionId).toBe(angular.versionId);

      const after = (await user.get(`/recommendations/${rec.id}`).expect(200)).body;
      expect(after.status).toBe('APPLIED');
      expect(after.appliedAt).not.toBeNull();
      await user.post(`/recommendations/${rec.id}/dismiss`).expect(409);
      // A job with an application appears in the Jobs list.
      const jobs = (await user.get('/jobs').expect(200)).body;
      expect(jobs.map((j: { id: string }) => j.id)).toContain(rec.job.id);
    });

    it('filters by alert', async () => {
      const { alert, recs } = await setup();
      expect(
        (await user.get(`/recommendations?alertId=${alert.id}`).expect(200)).body,
      ).toHaveLength(recs.length);
      const other = await createAlert({ name: 'Other' });
      expect((await user.get(`/recommendations?alertId=${other.id}`).expect(200)).body).toEqual([]);
    });
  });

  describe('notifications', () => {
    it('marks one or all as read', async () => {
      const make = (key: string) =>
        prisma.notification.create({
          data: {
            userId: user.userId,
            type: 'NEW_RECOMMENDATIONS',
            title: 't',
            body: 'b',
            dedupKey: key,
          },
        });
      const a = await make('a');
      await make('b');
      await make('c');
      expect((await user.get('/notifications').expect(200)).body.unreadCount).toBe(3);
      const read = (await user.patch(`/notifications/${a.id}/read`).expect(200)).body;
      expect(read.readAt).not.toBeNull();
      expect((await user.get('/notifications').expect(200)).body.unreadCount).toBe(2);
      expect((await user.patch('/notifications/read-all').expect(200)).body).toEqual({
        updated: 2,
      });
      expect((await user.get('/notifications').expect(200)).body.unreadCount).toBe(0);
      await user.patch('/notifications/not-a-uuid/read').expect(404);
    });
  });

  describe('scheduler', () => {
    it('runs due alerts once per scheduled time, using the same pipeline', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const alert = await createAlert();
      const paused = await createAlert({ name: 'Paused', isActive: false });
      const scheduler = app.get(JobAlertScheduler);
      const due = new Date(new Date(alert.nextRunAt).getTime() + 1000);

      expect(await scheduler.tick(new Date(new Date(alert.nextRunAt).getTime() - 60_000))).toBe(0);
      expect(await scheduler.tick(due)).toBe(1);
      await searches.drain();
      // The same tick again finds nothing due: nextRunAt moved to the following day.
      expect(await scheduler.tick(due)).toBe(0);

      const runs = (await user.get(`/job-alerts/${alert.id}/runs`).expect(200)).body;
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ trigger: 'SCHEDULED', status: 'COMPLETED' });
      expect(runs[0].recommendationsCreated).toBeGreaterThan(0);
      const updated = (await user.get(`/job-alerts/${alert.id}`).expect(200)).body;
      expect(new Date(updated.nextRunAt).getTime() - new Date(alert.nextRunAt).getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
      expect(updated.lastRunAt).not.toBeNull();
      expect((await user.get(`/job-alerts/${paused.id}/runs`).expect(200)).body).toEqual([]);
    });
  });

  describe('scheduler state', () => {
    it('does not run future, paused or deleted alerts', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const future = await createAlert({ name: 'Future' });
      const deleted = await createAlert({ name: 'Deleted' });
      await user.delete(`/job-alerts/${deleted.id}`).expect(204);
      const scheduler = app.get(JobAlertScheduler);
      // Just before the next scheduled time: nothing is due.
      expect(await scheduler.tick(new Date(new Date(future.nextRunAt).getTime() - 1000))).toBe(0);
      // Pause it, then pass its time: still nothing runs.
      await user.patch(`/job-alerts/${future.id}`, { isActive: false }).expect(200);
      expect(await scheduler.tick(new Date(new Date(future.nextRunAt).getTime() + 60_000))).toBe(0);
      expect(await prisma.jobSearchRun.count({ where: { userId: user.userId } })).toBe(0);
    });

    it('skips an alert whose stored schedule is invalid, without blocking other alerts', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const good = await createAlert({ name: 'Good' });
      const bad = await createAlert({ name: 'Bad' });
      // Corrupt the stored time zone (the API never accepts one).
      await prisma.jobSearchAlert.update({
        where: { id: bad.id },
        data: { timezone: 'Mars/Olympus_Mons' },
      });
      const scheduler = app.get(JobAlertScheduler);
      expect(await scheduler.tick(new Date(new Date(good.nextRunAt).getTime() + 1000))).toBe(1);
      await searches.drain();
      const runs = await prisma.jobSearchRun.findMany({ where: { userId: user.userId } });
      expect(runs.map((r) => r.alertId)).toEqual([good.id]);
      const stored = await prisma.jobSearchAlert.findUniqueOrThrow({ where: { id: bad.id } });
      expect(stored.nextRunAt).toBeNull();
    });

    it('finishes a run left unfinished by an API restart, without duplicates', async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const alert = await createAlert();
      // A run the previous process had started (status RUNNING) but never finished.
      const orphan = await prisma.jobSearchRun.create({
        data: { alertId: alert.id, userId: user.userId, trigger: 'SCHEDULED' },
      });
      // On startup the dispatcher re-queues unfinished runs.
      await (
        searches as unknown as { onApplicationBootstrap(): Promise<void> }
      ).onApplicationBootstrap();
      await searches.drain();
      const finished = await prisma.jobSearchRun.findUniqueOrThrow({ where: { id: orphan.id } });
      expect(finished.status).toBe('COMPLETED');
      expect(finished.recommendationsCreated).toBeGreaterThan(0);
      const recommendations = await prisma.jobRecommendation.count({
        where: { userId: user.userId },
      });
      // Re-queuing again (another restart) adds nothing: the run is already complete.
      await (
        searches as unknown as { onApplicationBootstrap(): Promise<void> }
      ).onApplicationBootstrap();
      await searches.drain();
      expect(await prisma.jobRecommendation.count({ where: { userId: user.userId } })).toBe(
        recommendations,
      );
    });
  });

  describe('security', () => {
    it("never exposes another user's alerts, runs, recommendations or notifications", async () => {
      await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const alert = await createAlert();
      await runNow(alert.id);
      const rec = (await user.get('/recommendations').expect(200)).body[0];
      const note = (await user.get('/notifications').expect(200)).body.items[0];

      const other = await signUp(app, 'Other User');
      await other.get(`/job-alerts/${alert.id}`).expect(404);
      await other.patch(`/job-alerts/${alert.id}`, { name: 'x' }).expect(404);
      await other.delete(`/job-alerts/${alert.id}`).expect(404);
      await other.post(`/job-alerts/${alert.id}/run`).expect(404);
      await other.get(`/job-alerts/${alert.id}/runs`).expect(404);
      await other.get(`/recommendations/${rec.id}`).expect(404);
      await other.post(`/recommendations/${rec.id}/save`).expect(404);
      await other.post(`/recommendations/${rec.id}/dismiss`).expect(404);
      await other.patch(`/notifications/${note.id}/read`).expect(404);
      await other.get(`/jobs/${rec.job.id}`).expect(404);
      expect((await other.get('/job-alerts').expect(200)).body).toEqual([]);
      expect((await other.get('/recommendations').expect(200)).body).toEqual([]);
      expect((await other.get('/notifications').expect(200)).body).toEqual({
        items: [],
        unreadCount: 0,
      });
      await other.patch('/notifications/read-all').expect(200);
      expect(
        (await prisma.notification.findUniqueOrThrow({ where: { id: note.id } })).readAt,
      ).toBeNull();

      // The other user's own search creates separate jobs: nothing is shared between users.
      await createReviewedResume(other, parsing, 'Angular Resume', ANGULAR_CONTENT);
      const otherAlert = await createAlert({}, other);
      const otherRun = await runNow(otherAlert.id, other);
      expect(otherRun.recommendationsCreated).toBeGreaterThan(0);
      const mine = await prisma.job.findMany({
        where: { userId: user.userId },
        select: { id: true },
      });
      const theirs = (await other.get('/recommendations').expect(200)).body;
      for (const r of theirs) expect(mine.map((j) => j.id)).not.toContain(r.job.id);
    });
  });
});

describe('Job discovery with failing providers (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let searches: JobSearchDispatcher;
  let adapters: JobSourceAdapter[];

  beforeAll(async () => {
    adapters = [new DevJobSourceAdapter(), new FailingSource()];
    // The array is shared by reference, so tests can change which sources are active.
    ({ app, prisma } = await createTestApp({ overrides: [[JOB_SOURCE_ADAPTERS, adapters]] }));
    parsing = app.get(ParsingDispatcher);
    searches = app.get(JobSearchDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    adapters.splice(0, adapters.length, new DevJobSourceAdapter(), new FailingSource());
  });

  afterAll(async () => {
    await app.close();
  });

  async function run(user: TestUser, trigger: 'manual' | 'scheduled' = 'manual') {
    const alert = (await user.post('/job-alerts', ALERT).expect(201)).body;
    if (trigger === 'manual') await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    else await app.get(JobAlertScheduler).tick(new Date(new Date(alert.nextRunAt).getTime() + 1));
    await searches.drain();
    return (await user.get(`/job-alerts/${alert.id}/runs`).expect(200)).body[0];
  }

  it('one failing source makes the run PARTIAL; the others still produce recommendations', async () => {
    const user = await signUp(app);
    await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
    const result = await run(user);
    expect(result.status).toBe('PARTIAL');
    expect(result.recommendationsCreated).toBeGreaterThan(0);
    const failed = result.sources.find(
      (s: { sourceKey: string }) => s.sourceKey === 'failing-test',
    );
    expect(failed).toMatchObject({ status: 'FAILED', found: 0 });
    // The provider's raw error (which contained a credential) is never stored or returned.
    expect(JSON.stringify(result)).not.toContain(SECRET);
    const source = await prisma.jobSource.findUniqueOrThrow({ where: { key: 'failing-test' } });
    expect(source.lastError).not.toContain(SECRET);
    expect(source.lastFailureAt).not.toBeNull();
  });

  it('when every source fails the run is FAILED, and a scheduled failure notifies once', async () => {
    adapters.splice(0, adapters.length, new FailingSource());
    const user = await signUp(app);
    const result = await run(user, 'scheduled');
    expect(result).toMatchObject({ status: 'FAILED', jobsFound: 0, trigger: 'SCHEDULED' });
    expect(result.errorMessage).toMatch(/No job source could be searched/);
    const notes = (await user.get('/notifications').expect(200)).body;
    expect(notes.items).toHaveLength(1);
    expect(notes.items[0].type).toBe('ALERT_RUN_FAILED');
  });

  it('fails gracefully when no source is configured', async () => {
    adapters.splice(0, adapters.length);
    const user = await signUp(app);
    const result = await run(user);
    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toMatch(/No job sources are configured/);
    expect((await user.get('/job-sources').expect(200)).body).toEqual(NOT_INTEGRATED);
  });
});

describe('Job discovery from a real source in production mode (e2e)', () => {
  // Responses shaped like Adzuna's documented search results, served by an injected fetch:
  // the real adapter code runs end to end, without calling the live API.
  const REAL_DESCRIPTION = `We are hiring a Frontend Developer for our analytics product.

Responsibilities:
- Build reusable Angular components for our dashboards

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS`;
  const ads = [
    {
      id: 5001,
      title: '<strong>Frontend</strong> Developer',
      description: 'Short snippet…',
      full_description: REAL_DESCRIPTION,
      created: new Date(Date.now() - 86_400_000).toISOString(),
      redirect_url: 'https://www.adzuna.in/details/5001',
      location: { display_name: 'Bangalore, Karnataka' },
      company: { display_name: 'Real Analytics Pvt Ltd' },
      contract_time: 'full_time',
    },
    // An ad without a company is skipped (never given an invented one).
    {
      id: 5002,
      title: 'Frontend Developer',
      description: REAL_DESCRIPTION,
      location: { display_name: 'Bangalore' },
    },
    // A duplicate of the first ad in the same response.
    { id: 5001, title: 'Frontend Developer', description: REAL_DESCRIPTION },
  ];
  const fetchCalls: string[] = [];
  const fakeFetch = (url: string) => {
    fetchCalls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: ads }),
    });
  };

  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let searches: JobSearchDispatcher;

  beforeAll(async () => {
    const adzuna = new AdzunaJobSourceAdapter(
      { appId: 'id', appKey: 'key', country: 'in', maxDaysOld: 30, dailyRequestLimit: 200 },
      fakeFetch,
    );
    ({ app, prisma } = await createTestApp({
      overrides: [
        // The dev adapter is registered too: production mode must still never use it.
        [JOB_SOURCE_ADAPTERS, [new DevJobSourceAdapter(), adzuna]],
        [SampleDataPolicy, { allowSampleData: false }],
      ],
    }));
    parsing = app.get(ParsingDispatcher);
    searches = app.get(JobSearchDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fetchCalls.length = 0;
  });

  afterEach(async () => {
    await searches.drain();
  });

  afterAll(async () => {
    await app.close();
  });

  it('discovers, analyses, matches and recommends real jobs — never sample data', async () => {
    const user = await signUp(app, 'Thanga Sri');
    const resume = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
    const alert = (await user.post('/job-alerts', ALERT).expect(201)).body;

    const sources = (await user.get('/job-sources').expect(200)).body;
    expect(sources).toEqual([
      expect.objectContaining({
        key: 'dev',
        isDevelopment: true,
        isEnabled: false,
        status: 'DEVELOPMENT_ONLY',
      }),
      expect.objectContaining({
        key: 'adzuna',
        isDevelopment: false,
        isEnabled: true,
        status: 'ACTIVE',
        attribution: { label: 'Jobs by Adzuna', url: 'https://www.adzuna.in' },
      }),
      ...NOT_INTEGRATED,
    ]);
    // Never any credential in the source list.
    expect(JSON.stringify(sources)).not.toMatch(/"key"\s*:\s*"key"|app_key|appKey/);

    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    const [run] = (await user.get(`/job-alerts/${alert.id}/runs`).expect(200)).body;
    expect(run).toMatchObject({
      status: 'COMPLETED',
      jobsFound: 1,
      jobsCreated: 1,
      recommendationsCreated: 1,
    });
    expect(run.sources).toEqual([
      {
        sourceKey: 'adzuna',
        sourceName: 'Adzuna',
        isDevelopment: false,
        status: 'OK',
        returned: 2,
        found: 1,
        error: null,
      },
    ]);
    expect(new URL(fetchCalls[0]!).searchParams.get('what')).toBe('Frontend Developer');

    // Persisted as a real job, analysed with the same engine as a manually added job.
    const jobs = await prisma.job.findMany({ where: { userId: user.userId } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      title: 'Frontend Developer',
      companyName: 'Real Analytics Pvt Ltd',
      source: 'Adzuna',
      jobUrl: 'https://www.adzuna.in/details/5001',
      origin: 'DISCOVERED',
      isSampleData: false,
    });
    const detail = (await user.get(`/jobs/${jobs[0]!.id}`).expect(200)).body;
    expect(detail).toMatchObject({ analysisStatus: 'COMPLETED', isSampleData: false });
    expect(detail.recommendation.resumeVersionId).toBe(resume.versionId);

    const recs = (await user.get('/recommendations').expect(200)).body;
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      job: {
        title: 'Frontend Developer',
        companyName: 'Real Analytics Pvt Ltd',
        isSampleData: false,
      },
      source: {
        key: 'adzuna',
        isDevelopment: false,
        attribution: { label: 'Jobs by Adzuna', url: 'https://www.adzuna.in' },
      },
      resume: { resumeVersionId: resume.versionId },
    });
    expect(recs[0].matchScore).toBeGreaterThanOrEqual(75);

    // A second run adds no duplicate jobs or recommendations.
    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    expect(await prisma.job.count({ where: { userId: user.userId } })).toBe(1);
    expect(await prisma.jobRecommendation.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('never returns sample-data recommendations in production, even if they exist', async () => {
    const user = await signUp(app, 'Thanga Sri');
    // Simulate legacy sample data already in the database.
    const sampleJob = await prisma.job.create({
      data: {
        userId: user.userId,
        title: 'Frontend Developer',
        companyName: 'Northwind Analytics (sample)',
        description: 'Sample posting (development fixture).',
        normalizedDescription: 'Sample posting (development fixture).',
        contentHash: 'f'.repeat(64),
        origin: 'DISCOVERED',
        isSampleData: true,
        inLibrary: false,
      },
    });
    const sampleRec = await prisma.jobRecommendation.create({
      data: {
        userId: user.userId,
        jobId: sampleJob.id,
        matchScore: 90,
        rank: 90,
        reason: 'sample',
      },
    });
    expect((await user.get('/recommendations?status=ALL').expect(200)).body).toEqual([]);
    await user.get(`/recommendations/${sampleRec.id}`).expect(404);
    await user.post(`/recommendations/${sampleRec.id}/save`).expect(404);
    const dashboard = (await user.get('/dashboard/summary').expect(200)).body;
    expect(dashboard.recommendations.new).toBe(0);
  });
});

describe('Job discovery across several real sources (e2e)', () => {
  // Responses shaped like each provider's documented API, served by one injected fetch: the
  // real adapters run end to end without any live call.
  const DESCRIPTION = `We are hiring a Frontend Developer for our analytics product.

Responsibilities:
- Build reusable Angular components for our dashboards

Requirements:
- 2+ years of professional experience in frontend development
- Strong experience with Angular, TypeScript and RxJS`;
  const escaped = DESCRIPTION.replace(/&/g, '&amp;')
    .split('\n')
    .map((line) => `&lt;p&gt;${line}&lt;/p&gt;`)
    .join('');
  const yesterday = new Date(Date.now() - 86_400_000);
  const greenhouseJob = {
    id: 77,
    title: 'Frontend Developer',
    absolute_url: 'https://boards.greenhouse.io/realco/jobs/77',
    location: { name: 'Bengaluru, India' },
    first_published: yesterday.toISOString(),
    content: escaped,
  };
  const greenhouseBoard = { jobs: [greenhouseJob] };
  const routes: [string, { status?: number; body?: unknown }][] = [
    // The employer's own Greenhouse board lists the job…
    ['https://boards-api.greenhouse.io/v1/boards/realco/jobs', { body: greenhouseBoard }],
    // …and Adzuna lists the same job: the employer's posting must win.
    [
      'https://api.adzuna.com/',
      {
        body: {
          results: [
            {
              id: 9001,
              title: 'Frontend Developer',
              full_description: DESCRIPTION,
              created: yesterday.toISOString(),
              redirect_url: 'https://www.adzuna.in/details/9001',
              location: { display_name: 'Bangalore, Karnataka' },
              company: { display_name: 'Real Analytics' },
            },
          ],
        },
      },
    ],
    [
      'https://api.lever.co/v0/postings/leverco',
      {
        body: [
          {
            id: 'abc-123',
            text: 'Frontend Developer (Angular)',
            hostedUrl: 'https://jobs.lever.co/leverco/abc-123',
            workplaceType: 'remote',
            categories: { location: 'Remote - India', commitment: 'Full-time' },
            createdAt: yesterday.getTime(),
            descriptionPlain: DESCRIPTION,
          },
        ],
      },
    ],
    // Remotive is down: the other sources still produce recommendations.
    ['https://remotive.com/', { status: 500 }],
  ];
  const fetchCalls: string[] = [];
  const fakeFetch = (url: string) => {
    fetchCalls.push(url);
    const route = routes.find(([prefix]) => url.startsWith(prefix));
    const status = route?.[1].status ?? (route ? 200 : 404);
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(route?.[1].body ?? {}),
    });
  };

  let app: NestExpressApplication;
  let prisma: PrismaService;
  let parsing: ParsingDispatcher;
  let searches: JobSearchDispatcher;
  // Board responses are cached for an hour; each test starts past that.
  let clock = Date.now();

  beforeAll(async () => {
    const adapters = [
      new AdzunaJobSourceAdapter(
        { appId: 'id', appKey: 'key', country: 'in', maxDaysOld: 30, dailyRequestLimit: 200 },
        fakeFetch,
      ),
      new RemotiveJobSourceAdapter({ dailyRequestLimit: 4 }, fakeFetch),
      new GreenhouseJobSourceAdapter(
        { boards: [{ id: 'realco', name: 'Real Analytics' }] },
        fakeFetch,
        () => clock,
      ),
      new LeverJobSourceAdapter(
        { sites: [{ id: 'leverco', name: 'Lever Co' }], region: 'global' },
        fakeFetch,
        () => clock,
      ),
    ];
    ({ app, prisma } = await createTestApp({
      overrides: [
        [JOB_SOURCE_ADAPTERS, adapters],
        [SampleDataPolicy, { allowSampleData: false }],
      ],
    }));
    parsing = app.get(ParsingDispatcher);
    searches = app.get(JobSearchDispatcher);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fetchCalls.length = 0;
    clock += 2 * 60 * 60 * 1000;
    greenhouseBoard.jobs = [greenhouseJob];
  });

  afterEach(async () => {
    await searches.drain();
  });

  afterAll(async () => {
    await app.close();
  });

  it('replaces a job search service’s copy with the employer’s posting when it appears later', async () => {
    const user = await signUp(app, 'Thanga Sri');
    await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
    const alert = (await user.post('/job-alerts', ALERT).expect(201)).body;

    greenhouseBoard.jobs = []; // not on the employer's board yet
    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    const job = await prisma.job.findFirstOrThrow({
      where: { userId: user.userId, companyName: 'Real Analytics' },
    });
    expect([job.source, job.jobUrl]).toEqual(['Adzuna', 'https://www.adzuna.in/details/9001']);

    clock += 2 * 60 * 60 * 1000;
    greenhouseBoard.jobs = [greenhouseJob];
    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    const [latest] = (await user.get(`/job-alerts/${alert.id}/runs`).expect(200)).body;
    expect(latest).toMatchObject({ jobsCreated: 0, duplicates: 1, recommendationsCreated: 0 });
    const upgraded = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect([upgraded.source, upgraded.jobUrl]).toEqual([
      'Greenhouse',
      'https://boards.greenhouse.io/realco/jobs/77',
    ]);
    expect(await prisma.job.count({ where: { userId: user.userId } })).toBe(2);
    expect(await prisma.jobRecommendation.count({ where: { userId: user.userId } })).toBe(2);
  });

  it('searches every source with the profile-based strategy, keeps the employer posting and tolerates a failing source', async () => {
    const user = await signUp(app, 'Thanga Sri');
    await user
      .put('/profile', {
        fullName: 'Thanga Sri',
        phone: null,
        location: 'Chennai',
        country: 'India',
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        preferredRoles: ['Angular Developer'],
        preferredLocations: [],
        workModes: [],
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        employmentTypes: [],
        noticePeriod: null,
        workAuthorization: null,
        headline: null,
        summary: null,
        yearsOfExperience: 3,
        currentJobTitle: null,
        currentCompany: null,
        previousJobTitles: [],
        previousCompanies: [],
      })
      .expect(200);
    const resume = await createReviewedResume(user, parsing, 'Angular Resume', ANGULAR_CONTENT);
    const alert = (await user.post('/job-alerts', ALERT).expect(201)).body;

    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    const [run] = (await user.get(`/job-alerts/${alert.id}/runs`).expect(200)).body;

    expect(run).toMatchObject({
      status: 'PARTIAL',
      errorMessage: 'Some job sources could not be searched.',
      jobsDiscovered: 3,
      jobsFound: 3,
      jobsCreated: 2,
      duplicates: 1,
      jobsAnalyzed: 2,
      recommendationsCreated: 2,
      searchStrategy: {
        keywords: ['Frontend Developer', 'Angular Developer'],
        alternateTitles: ['Angular Developer'],
        locations: ['Bangalore'],
        remotePreference: 'ANY',
      },
    });
    expect(run.sources).toEqual([
      expect.objectContaining({ sourceKey: 'adzuna', status: 'OK', returned: 1, found: 1 }),
      {
        sourceKey: 'remotive',
        sourceName: 'Remotive',
        isDevelopment: false,
        status: 'FAILED',
        returned: 0,
        found: 0,
        error: 'Remotive returned an error (HTTP 500).',
      },
      expect.objectContaining({ sourceKey: 'greenhouse', status: 'OK', returned: 1, found: 1 }),
      expect.objectContaining({ sourceKey: 'lever', status: 'OK', returned: 1, found: 1 }),
    ]);
    // The profile's alternate title was searched too (keywords × the alert's location).
    const whats = fetchCalls
      .filter((u) => u.startsWith('https://api.adzuna.com/'))
      .map((u) => new URL(u).searchParams.get('what'));
    expect(whats).toEqual(['Frontend Developer', 'Angular Developer']);

    // One job per real posting; the cross-listed one points at the employer's posting.
    const jobs = await prisma.job.findMany({
      where: { userId: user.userId },
      orderBy: { companyName: 'asc' },
    });
    expect(jobs.map((j) => [j.companyName, j.source, j.jobUrl, j.isSampleData])).toEqual([
      ['Lever Co', 'Lever', 'https://jobs.lever.co/leverco/abc-123', false],
      ['Real Analytics', 'Greenhouse', 'https://boards.greenhouse.io/realco/jobs/77', false],
    ]);
    const discovered = await prisma.discoveredJob.findMany({
      where: { userId: user.userId },
      include: { source: true },
      orderBy: { discoveredFrom: 'asc' },
    });
    expect(discovered.map((d) => [d.source.key, d.outcome, d.discoveredFrom])).toEqual([
      ['adzuna', 'DUPLICATE', 'Adzuna search API (IN)'],
      ['greenhouse', 'RECOMMENDED', 'Greenhouse job board: realco'],
      ['lever', 'RECOMMENDED', 'Lever job site: leverco'],
    ]);
    const realco = jobs.find((j) => j.companyName === 'Real Analytics')!;
    expect(discovered[0]!.jobId).toBe(realco.id);

    const recs = (await user.get('/recommendations').expect(200)).body;
    expect(recs).toHaveLength(2);
    for (const r of recs) {
      expect(r.matchScore).toBeGreaterThanOrEqual(75);
      expect(r.resume.resumeVersionId).toBe(resume.versionId);
      expect(r.job.isSampleData).toBe(false);
    }
    const lever = recs.find((r: { source: { key: string } }) => r.source.key === 'lever');
    expect(lever).toMatchObject({
      job: { workMode: 'REMOTE', location: 'Remote - India', postedAt: yesterday.toISOString() },
      source: { name: 'Lever', discoveredFrom: 'Lever job site: leverco' },
    });

    // Filters narrow the list on the server.
    const bySource = (await user.get('/recommendations?source=greenhouse').expect(200)).body;
    expect(bySource.map((r: { job: { companyName: string } }) => r.job.companyName)).toEqual([
      'Real Analytics',
    ]);
    const remote = (await user.get('/recommendations?workMode=REMOTE').expect(200)).body;
    expect(remote).toHaveLength(1);
    expect((await user.get('/recommendations?company=lever').expect(200)).body).toHaveLength(1);
    expect((await user.get('/recommendations?title=backend').expect(200)).body).toHaveLength(0);
    expect((await user.get('/recommendations?location=bengaluru').expect(200)).body).toHaveLength(
      1,
    );
    expect(await user.get('/recommendations?minScore=101').expect(400));

    // A second run (Remotive still down) adds nothing new.
    await user.post(`/job-alerts/${alert.id}/run`).expect(202);
    await searches.drain();
    expect(await prisma.job.count({ where: { userId: user.userId } })).toBe(2);
    expect(await prisma.jobRecommendation.count({ where: { userId: user.userId } })).toBe(2);
  });
});
