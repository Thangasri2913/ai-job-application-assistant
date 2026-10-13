import {
  APPLICATION_STATUSES,
  type CareerInsightsResponse,
  type CareerIntelligenceReport,
  type OutcomeMetrics,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { applicationDetail, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const metrics = (applications: number, interviews: number, offers = 0): OutcomeMetrics => ({
  applications,
  responses: interviews,
  interviews,
  offers,
  accepted: 0,
  rejections: 0,
  responseRate: applications ? interviews / applications : null,
  interviewRate: applications ? interviews / applications : null,
  offerRate: applications ? offers / applications : null,
  interviewToOfferRate: interviews ? offers / interviews : null,
  reliable: applications >= 5,
});

const zero = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<
  (typeof APPLICATION_STATUSES)[number],
  number
>;

function report(overrides: Partial<CareerIntelligenceReport> = {}): CareerIntelligenceReport {
  return {
    totals: {
      tracked: 4,
      submitted: 3,
      notSubmitted: 1,
      inProgress: 2,
      analysedTargetJobs: 3,
      outcomes: metrics(3, 1, 1),
    },
    funnel: {
      stages: [
        { stage: 'SAVED', label: 'Tracked', count: 4, conversionFromPrevious: null },
        { stage: 'APPLIED', label: 'Applied', count: 3, conversionFromPrevious: 0.75 },
        { stage: 'SCREENING', label: 'Screening', count: 1, conversionFromPrevious: 0.333 },
        { stage: 'INTERVIEW', label: 'Interview', count: 1, conversionFromPrevious: 1 },
        { stage: 'FINAL_INTERVIEW', label: 'Final interview', count: 1, conversionFromPrevious: 1 },
        { stage: 'OFFER', label: 'Offer', count: 1, conversionFromPrevious: 1 },
        { stage: 'ACCEPTED', label: 'Accepted', count: 0, conversionFromPrevious: 0 },
      ],
      everReached: zero,
      current: zero,
      rejectionCategories: [{ category: 'EXPERIENCE_LEVEL', count: 1 }],
    },
    breakdowns: {
      period: [],
      source: [{ key: 'linkedin', label: 'LinkedIn', ...metrics(3, 1, 1) }],
      role: [
        { key: 'frontend developer', label: 'Frontend Developer', ...metrics(2, 1, 1) },
        { key: 'angular developer', label: 'Angular Developer', ...metrics(1, 0) },
      ],
      company: [],
      location: [],
      workMode: [],
      seniority: [],
      skill: [],
      weekday: [],
    },
    resumes: [
      {
        resumeId: 'r1',
        resumeName: 'Angular Resume',
        resumeVersionId: 'v1',
        versionNumber: 1,
        isCurrent: true,
        resumeArchived: false,
        jobsMatched: 3,
        averageMatchScore: 82,
        ...metrics(3, 1, 1),
      },
    ],
    matchScores: {
      buckets: [{ key: '80-89', min: 80, max: 89, ...metrics(3, 1, 1) }],
      unscored: 0,
      alignedShare: 1,
    },
    skills: [
      {
        skill: 'Docker',
        jobs: 3,
        requiredIn: 2,
        coverage: { matched: 0, partial: 0, missing: 3 },
        coverageLevel: 'LIMITED',
        outcomes: metrics(0, 0),
        isGap: true,
      },
    ],
    interviewTopics: [],
    patterns: [],
    limitations: {
      submitted: 3,
      minimumForPatterns: 10,
      minimumGroupSize: 5,
      sufficientForPatterns: false,
      messages: [
        'You have 3 submitted applications. At least 10 are needed before reliable performance patterns can be identified; until then counts are shown without comparisons.',
      ],
    },
    calculatedAt: '2026-10-12T10:00:00.000Z',
    ...overrides,
  };
}

const insights = (o: Partial<CareerInsightsResponse> = {}): CareerInsightsResponse => ({
  run: {
    id: 'run1',
    status: 'COMPLETED',
    source: 'RULES',
    note: 'AI is not configured on this server: insights are rule-based.',
    error: null,
    generatedAt: '2026-10-12T10:00:00.000Z',
    expiresAt: '2026-10-19T10:00:00.000Z',
    createdAt: '2026-10-12T10:00:00.000Z',
  },
  insights: [
    {
      id: 'i1',
      category: 'SKILL_PRIORITY',
      title: 'Docker may be worth strengthening',
      explanation:
        'Docker appears in 3 of your 3 analysed target jobs (required in 2); your best-matching resume showed limited evidence for it in 3 of them.',
      evidence: [
        {
          factId: 'F3',
          statement:
            'Docker appears in 3 of your 3 analysed target jobs (required in 2); your best-matching resume showed limited evidence for it in 3 of them.',
          sampleSize: 3,
        },
      ],
      confidence: 'LOW',
      recommendedAction: 'If you have genuine Docker experience, consider highlighting it.',
      source: 'RULES',
      generatedAt: '2026-10-12T10:00:00.000Z',
    },
  ],
  stale: false,
  generating: false,
  aiEnabled: false,
  disclaimer: 'Insights describe patterns in your own recorded data. They are not predictions.',
  ...o,
});

const base = {
  'GET /auth/me': meOk,
  'GET /notifications': { body: { items: [], unreadCount: 0 } },
};

describe('CareerIntelligencePage', () => {
  it('renders analytics from the API, marking small samples and data limitations', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': { body: report() },
      'GET /career-intelligence/insights': { body: insights() },
    });
    renderApp('/career-intelligence');

    expect(await screen.findByRole('heading', { name: 'Career Intelligence' })).toBeInTheDocument();
    const limits = await screen.findByRole('region', { name: 'Data limitations' });
    expect(
      within(limits).getByText(/You have 3 submitted applications\. At least 10/),
    ).toBeInTheDocument();

    const kpis = screen.getByText('Interview rate', { selector: 'dt' }).closest('div')!;
    expect(kpis).toHaveTextContent('33%');

    const funnel = screen.getByRole('list', { name: 'Application funnel' });
    expect(within(funnel).getByLabelText('Applied: 3. 75% of tracked.')).toBeInTheDocument();
    expect(screen.getByText(/Rejections: Experience level \(1\)/)).toBeInTheDocument();

    const resumes = screen.getByRole('region', { name: 'Resume performance' });
    const row = within(resumes).getByRole('row', { name: /Angular Resume/ });
    expect(row).toHaveTextContent('82%');
    expect(within(row).getByText('Limited data')).toBeInTheDocument();

    const roles = screen.getByRole('region', { name: 'Target role performance' });
    expect(within(roles).getByRole('row', { name: /Angular Developer/ })).toHaveTextContent('0%');

    const skills = screen.getByRole('region', { name: 'Skill intelligence' });
    expect(within(skills).getByText('Worth strengthening')).toBeInTheDocument();
    expect(within(skills).getByText('Limited evidence')).toBeInTheDocument();

    expect(screen.getByText(/No reliable patterns yet/)).toBeInTheDocument();
  });

  it('shows rule-based insight cards with their evidence and refreshes on request', async () => {
    // After a refresh, the next poll returns the new run, completed.
    let refreshed = false;
    const newRun = { ...insights().run!, id: 'run2' };
    const api = mockApi({
      ...base,
      'GET /career-intelligence/overview': { body: report() },
      'GET /career-intelligence/insights': () => ({
        body: refreshed ? insights({ run: newRun }) : insights(),
      }),
      'POST /career-intelligence/insights/refresh': () => {
        refreshed = true;
        return {
          status: 202,
          body: insights({ generating: true, run: { ...newRun, status: 'PENDING' } }),
        };
      },
    });
    renderApp('/career-intelligence');

    const cards = await screen.findByRole('list', { name: 'Career insights' });
    const card = within(cards).getAllByRole('listitem')[0]!;
    expect(within(card).getByText('Skill priority')).toBeInTheDocument();
    expect(within(card).getByText('Low confidence')).toBeInTheDocument();
    expect(
      within(card).getByRole('heading', { name: 'Docker may be worth strengthening' }),
    ).toBeInTheDocument();
    await userEvent.click(within(card).getByText('Evidence (1)'));
    expect(within(card).getByRole('list', { name: 'Evidence' })).toHaveTextContent(
      /Docker appears in 3 of your 3 analysed target jobs/,
    );
    expect(screen.getByText('Rule-based')).toBeInTheDocument();
    expect(screen.getByText(/AI is not configured/)).toBeInTheDocument();
    expect(screen.getByText(/They are not predictions/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh insights' }));
    await waitFor(() =>
      expect(api.find('POST', '/career-intelligence/insights/refresh')).toHaveLength(1),
    );
    expect(await screen.findByText('Updating insights…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh insights/ })).toBeDisabled();
    expect(await screen.findByText('Insights updated.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh insights/ })).toBeEnabled();
  });

  it('shows a clear message when a refresh is already running', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': { body: report() },
      'GET /career-intelligence/insights': { body: insights() },
      'POST /career-intelligence/insights/refresh': {
        status: 409,
        body: {
          code: 'INSIGHTS_IN_PROGRESS',
          message: 'Your insights are already being generated.',
        },
      },
    });
    renderApp('/career-intelligence');
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh insights' }));
    expect(
      await screen.findByText('Your insights are already being generated.'),
    ).toBeInTheDocument();
  });

  it('shows an empty state for a new user', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': {
        body: report({
          totals: {
            tracked: 0,
            submitted: 0,
            notSubmitted: 0,
            inProgress: 0,
            analysedTargetJobs: 0,
            outcomes: metrics(0, 0),
          },
        }),
      },
    });
    renderApp('/career-intelligence');
    expect(await screen.findByText('Nothing to analyse yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Jobs' })).toHaveAttribute('href', '/jobs');
  });

  it('shows the error state when analytics cannot load', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': {
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
      },
    });
    renderApp('/career-intelligence');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('keeps the insights working when the analytics request fails', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': {
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
      },
      'GET /career-intelligence/insights': { body: insights() },
    });
    renderApp('/career-intelligence');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Docker may be worth strengthening' }),
    ).toBeInTheDocument();
  });

  it('labels observed data and recommendations, and says when groups cannot be compared', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': { body: report() },
      'GET /career-intelligence/insights': { body: insights() },
    });
    renderApp('/career-intelligence');
    const roles = await screen.findByRole('region', { name: /Target role performance/ });
    expect(within(roles).getByText('Observed data')).toBeInTheDocument();
    expect(within(roles).getByText(/Not enough data yet to compare roles/)).toBeInTheDocument();
    const sources = screen.getByRole('region', { name: /Job source performance/ });
    expect(within(sources).getByText(/Not enough data yet to compare sources/)).toBeInTheDocument();
    const skills = screen.getByRole('region', { name: /Skill intelligence/ });
    const priorities = await within(skills).findByRole('list', {
      name: 'Suggested skill priorities',
    });
    expect(within(priorities).getByText('Docker may be worth strengthening')).toBeInTheDocument();
    expect(within(skills).getByText('Recommendation')).toBeInTheDocument();
    const insightsCard = screen.getByRole('region', { name: /Career insights/ });
    expect(within(insightsCard).getByText('Recommendation')).toBeInTheDocument();
  });

  it('shows "no data" instead of 0% when nothing has been submitted', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': {
        body: report({
          totals: {
            tracked: 1,
            submitted: 0,
            notSubmitted: 1,
            inProgress: 0,
            analysedTargetJobs: 1,
            outcomes: metrics(0, 0),
          },
        }),
      },
      'GET /career-intelligence/insights': { body: insights() },
    });
    renderApp('/career-intelligence');
    const overview = await screen.findByRole('region', { name: 'Overview' });
    const rate = within(overview).getByText('Interview rate', { selector: 'dt' }).closest('div')!;
    expect(rate).toHaveTextContent('—');
    expect(rate).toHaveTextContent('No submitted applications yet');
    expect(rate).not.toHaveTextContent('0%');
  });

  it('redirects the old analytics placeholder to Career Intelligence', async () => {
    mockApi({
      ...base,
      'GET /career-intelligence/overview': { body: report() },
      'GET /career-intelligence/insights': { body: insights() },
    });
    renderApp('/analytics');
    expect(await screen.findByRole('heading', { name: 'Career Intelligence' })).toBeInTheDocument();
  });
});

describe('Application outcome recording', () => {
  it('records a rejection category and the date it happened', async () => {
    const detail = applicationDetail({
      status: 'APPLIED',
      allowedNextStatuses: ['REJECTED', 'TECHNICAL_INTERVIEW'],
    });
    let current = detail;
    const api = mockApi({
      ...base,
      'GET /applications/ap1': () => ({ body: current }),
      'GET /applications/ap1/timeline': { body: [] },
      'GET /applications/ap1/notes': { body: [] },
      'GET /applications/ap1/documents': { body: [] },
      'POST /applications/ap1/status': () => {
        current = { ...detail, status: 'REJECTED', rejectionCategory: 'SKILLS_MISMATCH' };
        return { body: current };
      },
    });
    renderApp('/applications/ap1');
    const status = await screen.findByRole('region', { name: 'Status' });
    expect(within(status).getByRole('option', { name: 'Technical Interview' })).toBeInTheDocument();
    await userEvent.selectOptions(within(status).getByLabelText('Change to'), 'REJECTED');
    await userEvent.selectOptions(
      within(status).getByLabelText('Category (optional)'),
      'SKILLS_MISMATCH',
    );
    await userEvent.type(
      within(status).getByLabelText('Date it happened (optional)'),
      '2026-10-10',
    );
    await userEvent.click(within(status).getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(api.find('POST', '/applications/ap1/status')).toHaveLength(1));
    expect(api.find('POST', '/applications/ap1/status')[0]!.body).toEqual({
      status: 'REJECTED',
      note: null,
      rejectionReason: null,
      rejectionCategory: 'SKILLS_MISMATCH',
      offerDetails: null,
      occurredOn: '2026-10-10',
    });
    expect(
      await within(status).findByText('Rejection category: Skills didn’t match'),
    ).toBeInTheDocument();
  });
});
