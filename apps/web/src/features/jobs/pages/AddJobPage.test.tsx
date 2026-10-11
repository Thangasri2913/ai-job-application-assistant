import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { analysisResult, jobDetail, matchesResponse, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const DESCRIPTION =
  'We are looking for a frontend developer.\n\nRequirements:\n- 3+ years of experience with Angular and TypeScript\n- REST APIs';

async function fill() {
  await userEvent.type(await screen.findByLabelText('Job title'), 'Frontend Developer');
  await userEvent.type(screen.getByLabelText('Company'), 'Example Corp');
  await userEvent.click(screen.getByLabelText('Job description'));
  await userEvent.paste(DESCRIPTION);
}

describe('AddJobPage', () => {
  it('validates before sending anything', async () => {
    const api = mockApi({ 'GET /auth/me': meOk });
    renderApp('/jobs/new');
    await userEvent.type(await screen.findByLabelText('Job description'), 'Too short');
    await userEvent.type(screen.getByLabelText(/^Job URL/), 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));
    expect(await screen.findByText('Enter the job title.')).toBeInTheDocument();
    expect(
      screen.getByText(/Paste the full job description \(at least 80 characters\)/, {
        selector: 'p.text-danger',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a full URL starting with https://')).toBeInTheDocument();
    expect(api.find('POST', '/jobs')).toHaveLength(0);
  });

  it('saves the job, starts the analysis and opens the job', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'POST /jobs': {
        status: 201,
        body: jobDetail({ currentAnalysisId: null, latestAnalysis: null, recommendation: null }),
      },
      'POST /jobs/j1/analyze': {
        status: 202,
        body: { analysisId: 'a1', status: 'PENDING', createdAt: '2026-10-11T09:00:00Z' },
      },
      'GET /jobs/j1': { body: jobDetail() },
      'GET /jobs/j1/matches': { body: matchesResponse() },
      'GET /jobs/j1/recommendation': {
        body: { recommendation: jobDetail().recommendation, reason: null },
      },
      'GET /jobs/j1/analysis': { body: analysisResult() },
    });
    const { router } = renderApp('/jobs/new');
    await fill();
    await userEvent.selectOptions(screen.getByLabelText(/^Employment type/), 'FULL_TIME');
    await userEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/jobs/j1'));
    expect(api.find('POST', '/jobs')[0]!.body).toEqual({
      title: 'Frontend Developer',
      companyName: 'Example Corp',
      description: DESCRIPTION,
      jobUrl: null,
      location: null,
      employmentType: 'FULL_TIME',
      source: null,
    });
    expect(api.find('POST', '/jobs/j1/analyze')).toHaveLength(1);
  });

  it('links to the existing job when it was already added', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'POST /jobs': {
        status: 409,
        body: {
          statusCode: 409,
          code: 'DUPLICATE_JOB',
          message: 'You already added this job.',
          meta: { existingJobId: 'j7' },
          timestamp: '',
          path: '/api/v1/jobs',
        },
      },
    });
    renderApp('/jobs/new');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));
    expect(await screen.findByText(/You already added this job\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the existing job' })).toHaveAttribute(
      'href',
      '/jobs/j7',
    );
  });
});
