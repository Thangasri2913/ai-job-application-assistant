import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { jobDetail, jobSummary, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

describe('JobsPage', () => {
  it('shows an empty state that leads to adding a job', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /jobs?status=ACTIVE': { body: [] } });
    renderApp('/jobs');
    expect(await screen.findByText('You haven’t added any jobs yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your first job' })).toHaveAttribute(
      'href',
      '/jobs/new',
    );
  });

  it('lists jobs with their real match, best resume and analysis state', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /jobs?status=ACTIVE': {
        body: [
          jobSummary(),
          jobSummary({
            id: 'j2',
            title: 'React Engineer',
            bestMatch: null,
            analysisStatus: 'RUNNING',
          }),
          jobSummary({
            id: 'j3',
            title: 'Data Engineer',
            bestMatch: null,
            analysisStatus: 'FAILED',
          }),
        ],
      },
    });
    renderApp('/jobs');
    const row = (await screen.findByRole('link', { name: 'Frontend Developer' })).closest('tr')!;
    expect(within(row).getByText('86%')).toBeInTheDocument();
    expect(within(row).getByText('Excellent match')).toBeInTheDocument();
    expect(within(row).getByText('Angular Resume')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: 'React Engineer' }).closest('tr')!).getByText(
        'Analysing…',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('link', { name: 'Data Engineer' }).closest('tr')!).getByText(
        'Analysis failed',
      ),
    ).toBeInTheDocument();
  });

  it('searches through the API and archives a job', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /jobs?status=ACTIVE': { body: [jobSummary()] },
      'GET /jobs?status=ACTIVE&q=example': { body: [jobSummary()] },
      'POST /jobs/j1/archive': { body: jobDetail({ status: 'ARCHIVED' }) },
    });
    renderApp('/jobs');
    await screen.findByRole('link', { name: 'Frontend Developer' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'example');
    await waitFor(() => expect(api.find('GET', '/jobs?status=ACTIVE&q=example')).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(api.find('POST', '/jobs/j1/archive')).toHaveLength(1));
  });
});
