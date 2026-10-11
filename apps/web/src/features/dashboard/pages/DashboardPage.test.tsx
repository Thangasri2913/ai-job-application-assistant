import { APPLICATION_STATUSES } from '@job-assist/shared';
import { screen, within } from '@testing-library/react';
import { mockApi } from '../../../test/api-mock';
import { completion, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const summary = (overrides = {}) => ({
  resumes: {
    total: 3,
    active: 2,
    archived: 1,
    defaultResume: { id: 'r1', name: 'Angular Developer' },
    needsReview: 1,
    latestUpload: { id: 'r2', name: 'Frontend Resume', uploadedAt: '2026-10-10T09:00:00.000Z' },
    recentlyUpdated: { id: 'r3', name: 'React Developer', updatedAt: '2026-10-11T09:00:00.000Z' },
  },
  profileCompletion: completion(72),
  applications: pipeline(),
  recommendations: { new: 0, strong: 0, moderate: 0, low: 0 },
  ...overrides,
});

function pipeline(counts: Record<string, number> = {}) {
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, counts[s] ?? 0]));
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { total, archived: 0, byStatus };
}

describe('DashboardPage', () => {
  it('shows real resume and profile numbers from the API', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /dashboard/summary': { body: summary() } });
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeInTheDocument();
    expect(await screen.findAllByText('72%')).not.toHaveLength(0);
    expect(screen.getByText('Active resumes · 3 total').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Resumes needing review').previousSibling).toHaveTextContent('1');
    expect(screen.getByText('Frontend Resume')).toBeInTheDocument();
    expect(screen.getByText('Angular Developer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /React Developer.*Recently updated/ })).toHaveAttribute(
      'href',
      '/resumes/r3',
    );
  });

  it('shows every pipeline stage in order', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /dashboard/summary': { body: summary() } });
    renderApp('/dashboard');
    const list = await screen.findByRole('list', { name: 'Pipeline stages' });
    expect(
      Array.from(list.querySelectorAll('li > span:first-child')).map((el) => el.textContent),
    ).toEqual([
      'Saved',
      'Preparing',
      'Applied',
      'Recruiter Screen',
      'Assessment',
      'Interview',
      'Final Interview',
      'Offer',
      'Rejected',
      'Withdrawn',
      'No Response',
    ]);
  });

  it('shows real application counts per stage', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /dashboard/summary': {
        body: summary({ applications: pipeline({ APPLIED: 3, INTERVIEW: 1 }) }),
      },
    });
    renderApp('/dashboard');
    expect(await screen.findByLabelText('3 applications')).toBeInTheDocument();
    expect(screen.getByLabelText('1 applications')).toBeInTheDocument();
    expect(screen.getByText(/4 active applications/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View applications' })).toHaveAttribute(
      'href',
      '/applications',
    );
  });

  it('never invents application metrics', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /dashboard/summary': {
        body: summary({
          resumes: {
            total: 0,
            active: 0,
            archived: 0,
            defaultResume: null,
            needsReview: 0,
            latestUpload: null,
            recentlyUpdated: null,
          },
          profileCompletion: completion(0),
        }),
      },
    });
    renderApp('/dashboard');
    expect(await screen.findByText('Not set')).toBeInTheDocument();
    // The only percentage on the page is the (real) profile completion.
    expect(document.body.textContent?.match(/\d+\s*%/g)).toEqual(['0%', '0%']);
  });

  it('shows new job recommendations by match level', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /dashboard/summary': {
        body: summary({ recommendations: { new: 5, strong: 3, moderate: 1, low: 1 } }),
      },
    });
    renderApp('/dashboard');
    const card = await screen.findByRole('region', { name: 'New recommendations' });
    expect((await within(card).findByText('Strong (70%+)')).nextSibling).toHaveTextContent('3');
    expect(within(card).getByText('Moderate (50–69%)').nextSibling).toHaveTextContent('1');
    expect(
      within(card).getByRole('link', { name: 'Review 5 new recommendations' }),
    ).toHaveAttribute('href', '/recommendations?status=NEW');
  });
});
