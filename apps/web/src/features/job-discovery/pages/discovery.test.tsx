import type {
  JobAlertItem,
  JobRecommendationItem,
  JobSearchRunItem,
  JobSourceItem,
  NotificationListResponse,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import {
  analysisResult,
  jobDetail,
  matchesResponse,
  meOk,
  recommendationItem,
} from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const devSource: JobSourceItem = {
  key: 'dev',
  name: 'Development sample jobs',
  kind: 'DEVELOPMENT',
  isDevelopment: true,
  isEnabled: true,
  description: 'Built-in fixture postings for development. Not real job listings.',
};

const run = (o: Partial<JobSearchRunItem> = {}): JobSearchRunItem => ({
  id: 'run1',
  alertId: 'al1',
  trigger: 'MANUAL',
  status: 'COMPLETED',
  jobsFound: 6,
  jobsCreated: 2,
  jobsSkipped: 4,
  belowThreshold: 3,
  recommendationsCreated: 2,
  sources: [
    {
      sourceKey: 'dev',
      sourceName: 'Development sample jobs',
      isDevelopment: true,
      status: 'OK',
      found: 6,
      error: null,
    },
  ],
  errorMessage: null,
  note: null,
  startedAt: '2026-10-11T09:00:00.000Z',
  completedAt: '2026-10-11T09:00:05.000Z',
  ...o,
});

const alert = (o: Partial<JobAlertItem> = {}): JobAlertItem => ({
  id: 'al1',
  name: 'Frontend Developer in Bangalore',
  keywords: ['Frontend Developer'],
  locations: ['Bangalore'],
  remotePreference: 'ANY',
  employmentTypes: [],
  experienceLevel: null,
  minimumMatchScore: 75,
  resumeMode: 'BEST_MATCH',
  isActive: true,
  schedule: { type: 'DAILY', time: '08:00', days: [], timezone: 'Asia/Kolkata' },
  lastRunAt: '2026-10-11T09:00:05.000Z',
  nextRunAt: '2026-10-12T02:30:00.000Z',
  lastRun: run(),
  recommendationCount: 2,
  createdAt: '2026-10-11T08:00:00.000Z',
  updatedAt: '2026-10-11T08:00:00.000Z',
  ...o,
});

const recommendation = (o: Partial<JobRecommendationItem> = {}): JobRecommendationItem => ({
  id: 'jr1',
  status: 'NEW',
  matchScore: 82,
  level: 'STRONG',
  rank: 88,
  reason: 'Strong match (82%) with “Angular Resume” v1. It shows 3 of 3 required skills.',
  reasons: [
    '“Angular Resume” v1 scored highest of the 2 resumes compared',
    'Matches your alert: “Frontend Developer” · Bangalore',
    'Posted yesterday',
  ],
  gaps: [],
  requiredSkills: { matched: ['Angular', 'TypeScript', 'RxJS'], missing: ['Docker'] },
  resume: { resumeId: 'r1', resumeVersionId: 'v1', resumeName: 'Angular Resume', versionNumber: 1 },
  job: {
    id: 'j1',
    title: 'Frontend Developer',
    companyName: 'Northwind Analytics (sample)',
    location: 'Bangalore, India',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    jobUrl: 'https://example.com/dev-job-source/sample-fe-angular-blr',
    postedAt: '2026-10-10T09:00:00.000Z',
    isSampleData: true,
  },
  source: { key: 'dev', name: 'Development sample jobs', isDevelopment: true },
  alert: { id: 'al1', name: 'Frontend Developer in Bangalore' },
  createdAt: '2026-10-11T09:00:05.000Z',
  viewedAt: null,
  savedAt: null,
  dismissedAt: null,
  appliedAt: null,
  ...o,
});

const noNotifications: NotificationListResponse = { items: [], unreadCount: 0 };

describe('Recommended jobs', () => {
  it('lists recommendations with the explanation, skills, resume and a sample-data label', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-sources': { body: [devSource] },
      'GET /job-alerts': { body: [alert()] },
      'GET /recommendations?status=ACTIVE': { body: [recommendation()] },
      'POST /recommendations/jr1/save': { body: recommendation({ status: 'SAVED' }) },
      'POST /recommendations/jr1/dismiss': { body: recommendation({ status: 'DISMISSED' }) },
    });
    renderApp('/recommendations');

    const list = await screen.findByRole('list', { name: 'Recommended jobs' });
    const card = within(list).getAllByRole('listitem')[0]!;
    expect(within(card).getByRole('link', { name: 'Frontend Developer' })).toHaveAttribute(
      'href',
      '/jobs/j1?recommendation=jr1',
    );
    expect(within(card).getByText('82% · Strong match')).toBeInTheDocument();
    expect(within(card).getByText(/It shows 3 of 3 required skills/)).toBeInTheDocument();
    expect(within(card).getByText('✗ Docker')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Angular Resume v1' })).toHaveAttribute(
      'href',
      '/resumes/r1',
    );
    expect(within(card).getByText('Sample data')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/Development mode.*not a real job board/);

    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('POST', '/recommendations/jr1/save')).toHaveLength(1));
    await userEvent.click(within(card).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(api.find('POST', '/recommendations/jr1/dismiss')).toHaveLength(1));
  });

  it('filters by status and alert, and explains how to get recommendations when empty', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-sources': { body: [] },
      'GET /job-alerts': { body: [alert()] },
      'GET /recommendations?status=ACTIVE': { body: [] },
      'GET /recommendations?status=SAVED': { body: [] },
      'GET /recommendations?status=SAVED&alertId=al1': { body: [] },
    });
    renderApp('/recommendations');
    expect(await screen.findByText('No recommendations yet')).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'SAVED');
    await userEvent.selectOptions(await screen.findByLabelText('Alert'), 'al1');
    await waitFor(() =>
      expect(api.find('GET', '/recommendations?status=SAVED&alertId=al1')).toHaveLength(1),
    );
  });
});

describe('Job alerts', () => {
  it('creates an alert with the browser time zone and runs it now', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-sources': { body: [devSource] },
      'GET /job-alerts': { body: [] },
      'POST /job-alerts': { status: 201, body: alert({ lastRun: null }) },
    });
    renderApp('/job-alerts');
    await userEvent.click(await screen.findByRole('button', { name: 'Create your first alert' }));
    const dialog = screen.getByRole('dialog', { name: 'New job alert' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create alert' }));
    expect(within(dialog).getByText('Give the alert a name.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Add at least one keyword/)).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText('Alert name'),
      'Frontend Developer in Bangalore',
    );
    await userEvent.type(within(dialog).getByLabelText('Keywords'), 'Frontend Developer{Enter}');
    await userEvent.type(within(dialog).getByLabelText(/Locations/), 'Bangalore{Enter}');
    const score = within(dialog).getByLabelText('Minimum match score (%)');
    await userEvent.clear(score);
    await userEvent.type(score, '75');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create alert' }));

    await waitFor(() => expect(api.find('POST', '/job-alerts')).toHaveLength(1));
    expect(api.find('POST', '/job-alerts')[0]!.body).toEqual({
      name: 'Frontend Developer in Bangalore',
      keywords: ['Frontend Developer'],
      locations: ['Bangalore'],
      remotePreference: 'ANY',
      employmentTypes: [],
      experienceLevel: null,
      minimumMatchScore: 75,
      resumeMode: 'BEST_MATCH',
      schedule: {
        type: 'DAILY',
        time: '08:00',
        days: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  });

  it('shows each alert with its schedule and last run, and runs it on demand', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-sources': { body: [devSource] },
      'GET /job-alerts': { body: [alert()] },
      'POST /job-alerts/al1/run': { status: 202, body: run({ status: 'RUNNING' }) },
    });
    renderApp('/job-alerts');
    const card = within(await screen.findByRole('list', { name: 'Job alerts' })).getByRole(
      'listitem',
    );
    expect(within(card).getByText('Every day at 08:00 (Asia/Kolkata)')).toBeInTheDocument();
    expect(within(card).getByText('2 new recommendations')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Development mode');
    await userEvent.click(within(card).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(api.find('POST', '/job-alerts/al1/run')).toHaveLength(1));
  });

  it('warns when no job source is configured', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-sources': { body: [] },
      'GET /job-alerts': { body: [] },
    });
    renderApp('/job-alerts');
    expect(await screen.findByText(/No job sources are configured/)).toBeInTheDocument();
  });

  it('shows run history with counts and failed sources', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /job-alerts/al1': { body: alert() },
      'GET /job-alerts/al1/runs': {
        body: [
          run({
            id: 'run2',
            status: 'PARTIAL',
            errorMessage: 'Some job sources could not be searched.',
            sources: [
              ...run().sources,
              {
                sourceKey: 'other',
                sourceName: 'Other API',
                isDevelopment: false,
                status: 'FAILED',
                found: 0,
                error: 'The job source could not be reached.',
              },
            ],
          }),
          run(),
        ],
      },
    });
    renderApp('/job-alerts/al1/runs');
    const runs = await screen.findByRole('list', { name: 'Search runs' });
    const partial = within(runs)
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('Partly completed'));
    expect(partial).toBeDefined();
    expect(within(partial!).getByText('Below threshold').nextSibling).toHaveTextContent('3');
    expect(
      within(partial!).getByText('Some job sources could not be searched.'),
    ).toBeInTheDocument();
    expect(within(partial!).getByText('Other API: failed')).toBeInTheDocument();
    expect(
      within(partial!).getByText('Development sample jobs (sample data): 6 found'),
    ).toBeInTheDocument();
  });
});

describe('Notifications', () => {
  it('shows the unread count, lists notifications and marks them read', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /dashboard/summary': { status: 404 },
      'GET /notifications': {
        body: {
          unreadCount: 2,
          items: [
            {
              id: 'n1',
              channel: 'IN_APP',
              type: 'NEW_RECOMMENDATIONS',
              title: '2 new job recommendations',
              body: 'Your alert “Frontend Developer in Bangalore” found 2 jobs matching at least 75%.',
              link: '/recommendations?alertId=al1',
              readAt: null,
              createdAt: '2026-10-11T09:00:05.000Z',
            },
          ],
        },
      },
      'PATCH /notifications/read-all': { body: { updated: 2 } },
    });
    renderApp('/dashboard');
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    await userEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByRole('link', { name: /2 new job recommendations/ })).toHaveAttribute(
      'href',
      '/recommendations?alertId=al1',
    );
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(api.find('PATCH', '/notifications/read-all')).toHaveLength(1));
  });
});

describe('Job details from a recommendation', () => {
  it('explains the recommendation and labels sample data', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': { body: noNotifications },
      'GET /jobs/j1': {
        body: jobDetail({
          origin: 'DISCOVERED',
          isSampleData: true,
          inLibrary: false,
          source: 'Development sample jobs',
        }),
      },
      'GET /jobs/j1/analysis': { body: analysisResult() },
      'GET /jobs/j1/matches': { body: matchesResponse() },
      'GET /jobs/j1/recommendation': {
        body: { recommendation: recommendationItem(), reason: null },
      },
      'GET /resumes?status=ACTIVE': { body: [] },
      'GET /recommendations/jr1': { body: recommendation({ status: 'VIEWED' }) },
      'POST /recommendations/jr1/save': { body: recommendation({ status: 'SAVED' }) },
    });
    renderApp('/jobs/j1?recommendation=jr1');
    const why = await screen.findByRole('region', { name: 'Why this job was recommended' });
    expect(within(why).getByText(/Strong match \(82%\)/)).toBeInTheDocument();
    expect(within(why).getByText('Posted yesterday')).toBeInTheDocument();
    expect(within(why).getByText(/not a prediction of being hired/)).toBeInTheDocument();
    expect(screen.getAllByRole('note')[0]).toHaveTextContent('Development mode');
    await userEvent.click(within(why).getByRole('button', { name: 'Save job' }));
    await waitFor(() => expect(api.find('POST', '/recommendations/jr1/save')).toHaveLength(1));
  });
});
