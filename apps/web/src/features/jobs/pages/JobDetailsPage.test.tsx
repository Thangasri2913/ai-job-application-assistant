import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import {
  analysisResult,
  applicationDetail,
  jobDetail,
  matchesResponse,
  meOk,
  recommendationItem,
  resume,
  version,
} from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

function setup(extra = {}) {
  return mockApi({
    'GET /auth/me': meOk,
    'GET /jobs/j1': { body: jobDetail() },
    'GET /jobs/j1/analysis': { body: analysisResult() },
    'GET /jobs/j1/matches': { body: matchesResponse() },
    'GET /jobs/j1/recommendation': { body: { recommendation: recommendationItem(), reason: null } },
    'GET /resumes?status=ACTIVE': {
      body: [
        resume({
          id: 'r1',
          name: 'Angular Resume',
          currentVersion: version({ id: 'v1', versionNumber: 3 }),
        }),
        resume({
          id: 'r2',
          name: 'React Resume',
          currentVersion: version({ id: 'v2', versionNumber: 1 }),
        }),
      ],
    },
    ...extra,
  });
}

describe('JobDetailsPage', () => {
  it('shows the compatibility score, every compared resume and the recommendation', async () => {
    setup();
    renderApp('/jobs/j1');
    const overview = (await screen.findByRole('heading', { name: 'Match overview' })).closest(
      'section',
    )!;
    expect(
      within(overview).getAllByText('AI-assisted job compatibility score').length,
    ).toBeGreaterThan(0);
    expect(await within(overview).findByLabelText('86 percent')).toBeInTheDocument();
    expect(within(overview).getByText('Not stated in the job')).toBeInTheDocument(); // education
    expect(
      within(overview).getByText(/not a prediction of hiring or ATS results/),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/hiring probability|interview probability/i);

    const comparison = screen.getByRole('list', { name: 'Compared resumes' });
    const rows = within(comparison).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Angular Resume')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Recommended')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('74%')).toBeInTheDocument();
    expect(
      within(rows[1]!).getByText(/Required skills not found: Angular, RxJS/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Draft Resume/).closest('li')).toHaveTextContent(
      /No reviewed version yet/,
    );

    const rec = screen
      .getByRole('heading', { name: 'Recommended resume', level: 2 })
      .closest('section')!;
    expect(within(rec).getByText(/Matches 3 of 3 required skills/)).toBeInTheDocument();
    expect(within(rec).getByText('Preferred skills not found: AWS')).toBeInTheDocument();
  });

  it('separates required and preferred requirements', async () => {
    setup();
    renderApp('/jobs/j1');
    const required = (await screen.findByRole('heading', { name: 'Required skills' })).closest(
      'section',
    )!;
    expect(within(required).getByText('Angular')).toBeInTheDocument();
    expect(within(required).queryByText('AWS')).not.toBeInTheDocument();
    const preferred = screen.getByRole('heading', { name: 'Preferred skills' }).closest('section')!;
    expect(within(preferred).getByText('AWS')).toBeInTheDocument();
    expect(screen.getByText(/rule-based analysis only/)).toBeInTheDocument();
  });

  it('explains a score with evidence from the resume', async () => {
    setup();
    renderApp('/jobs/j1');
    await userEvent.click(await screen.findByRole('button', { name: 'Why 86%?' }));
    expect(
      screen.getAllByText(/This resume lists it in work experience: Frontend Developer at Acme\./)
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/No AWS experience was found in this resume\./).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Resume: “Developed reusable UI components for the design system”/)
        .length,
    ).toBeGreaterThan(0);
  });

  it('lets the user use the recommended resume or choose another', async () => {
    const api = setup({
      'PUT /jobs/j1/selected-resume': ({ body }: { body: unknown }) => ({
        body: jobDetail({
          selectedResume: {
            resumeId: 'r2',
            resumeVersionId: (body as { resumeVersionId: string }).resumeVersionId,
            resumeName: 'React Resume',
            versionNumber: 1,
            selectedAt: '2026-10-11T10:00:00Z',
            isRecommended: false,
          },
        }),
      }),
    });
    renderApp('/jobs/j1');
    await userEvent.click(await screen.findByRole('button', { name: 'Use recommended resume' }));
    await waitFor(() => expect(api.find('PUT', '/jobs/j1/selected-resume')).toHaveLength(1));
    expect(api.find('PUT', '/jobs/j1/selected-resume')[0]!.body).toEqual({ resumeVersionId: 'v1' });

    await userEvent.click(screen.getByRole('radio', { name: /React Resume/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Use selected resume' }));
    await waitFor(() => expect(api.find('PUT', '/jobs/j1/selected-resume')).toHaveLength(2));
    expect(api.find('PUT', '/jobs/j1/selected-resume')[1]!.body).toEqual({ resumeVersionId: 'v2' });
  });

  it('shows progress while the analysis runs', async () => {
    setup({
      'GET /jobs/j1': {
        body: jobDetail({
          currentAnalysisId: null,
          recommendation: null,
          latestAnalysis: {
            id: 'a1',
            status: 'RUNNING',
            error: null,
            createdAt: '2026-10-11T09:00:00Z',
            completedAt: null,
            outdated: false,
          },
        }),
      },
    });
    renderApp('/jobs/j1');
    expect(
      await screen.findByText(/Analysing the job and comparing it with all your resumes/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Results appear here once the job has been analysed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-analyse' })).toBeDisabled();
  });

  it('never hides a failed analysis and offers a retry', async () => {
    const api = setup({
      'GET /jobs/j1': {
        body: jobDetail({
          currentAnalysisId: null,
          recommendation: null,
          latestAnalysis: {
            id: 'a2',
            status: 'FAILED',
            error:
              'We couldn’t find any skills, responsibilities or experience requirements in this description.',
            createdAt: '2026-10-11T09:00:00Z',
            completedAt: '2026-10-11T09:00:01Z',
            outdated: false,
          },
        }),
      },
      'POST /jobs/j1/analyze': {
        status: 202,
        body: { analysisId: 'a3', status: 'PENDING', createdAt: '2026-10-11T09:01:00Z' },
      },
    });
    renderApp('/jobs/j1');
    expect(await screen.findByText('The analysis didn’t complete.')).toBeInTheDocument();
    expect(screen.getByText(/couldn’t find any skills/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.find('POST', '/jobs/j1/analyze')).toHaveLength(1));
  });

  it('asks to re-analyse when the job or the resumes changed', async () => {
    setup({ 'GET /jobs/j1/matches': { body: matchesResponse({ stale: true }) } });
    renderApp('/jobs/j1');
    expect(await screen.findByText(/Your resumes changed after this analysis/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse again' })).toBeInTheDocument();
  });

  it('shows a not-found state for a job the user cannot access', async () => {
    mockApi({ 'GET /auth/me': meOk });
    renderApp('/jobs/someone-elses');
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument();
  });
  it('tracks an application with the AI-recommended version preselected, but lets the user choose', async () => {
    const api = setup({
      'POST /applications': { status: 201, body: applicationDetail({ id: 'ap9' }) },
    });
    const { router } = renderApp('/jobs/j1');
    await userEvent.click(await screen.findByRole('button', { name: 'Track application' }));
    const dialog = await screen.findByRole('dialog');
    const recommended = within(dialog).getByRole('radio', { name: /Angular Resume/ });
    expect(recommended).toBeChecked();
    expect(recommended.closest('label')).toHaveTextContent('AI recommended');
    expect(recommended.closest('label')).toHaveTextContent('86%');

    await userEvent.click(within(dialog).getByRole('radio', { name: /React Resume/ }));
    expect(
      within(dialog).getByText(/You chose a different resume than the AI recommendation/),
    ).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'APPLIED');
    await userEvent.type(within(dialog).getByLabelText(/^Application source/), 'LinkedIn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create application' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/applications/ap9'));
    expect(api.find('POST', '/applications')[0]!.body).toEqual({
      jobId: 'j1',
      resumeVersionId: 'v2',
      status: 'APPLIED',
      appliedAt: new Date().toISOString().slice(0, 10),
      source: 'LinkedIn',
      applicationUrl: null,
      note: null,
    });
  });

  it('points to the existing application instead of creating a duplicate', async () => {
    setup({
      'POST /applications': {
        status: 409,
        body: {
          statusCode: 409,
          code: 'APPLICATION_EXISTS',
          message: 'You already have an application for this job.',
          meta: { existingApplicationId: 'ap1' },
          timestamp: '',
          path: '/api/v1/applications',
        },
      },
    });
    renderApp('/jobs/j1');
    await userEvent.click(await screen.findByRole('button', { name: 'Track application' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create application' }));
    expect(
      await within(dialog).findByText(/You already have an application for this job\./),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'View application' })).toHaveAttribute(
      'href',
      '/applications/ap1',
    );
  });

  it('shows the tracked application instead of the button', async () => {
    setup({
      'GET /jobs/j1': {
        body: jobDetail({
          application: {
            id: 'ap1',
            status: 'APPLIED',
            resumeName: 'Angular Resume',
            versionNumber: 3,
          },
        }),
      },
    });
    renderApp('/jobs/j1');
    const panel = (await screen.findByRole('heading', { name: 'Application' })).closest('section')!;
    expect(await within(panel).findByText('Applied')).toBeInTheDocument();
    expect(within(panel).getByText('v3')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'View application' })).toHaveAttribute(
      'href',
      '/applications/ap1',
    );
    expect(screen.queryByRole('button', { name: 'Track application' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Apply now|Submit application/);
  });
});
