import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from '../src/database/prisma.service.js';
import { JobAlertScheduler } from '../src/modules/job-discovery/job-alert-scheduler.js';
import { JobSearchDispatcher } from '../src/modules/job-discovery/job-search-dispatcher.js';
import { DevJobSourceAdapter } from '../src/modules/job-discovery/sources/dev-job-source.js';
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

/** A provider that always fails, with a credential-like string in its error. */
class FailingSource extends JobSourceAdapter<never> {
  readonly descriptor: JobSourceDescriptor = {
    key: 'failing-test',
    name: 'Failing test source',
    kind: 'API',
    isDevelopment: false,
    description: 'Test double',
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
        expect.objectContaining({ key: 'dev', isDevelopment: true, isEnabled: true }),
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
          isDevelopment: true,
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
    expect((await user.get('/job-sources').expect(200)).body).toEqual([]);
  });
});
