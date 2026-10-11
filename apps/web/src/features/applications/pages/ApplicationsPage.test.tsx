import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { applicationSummary, meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

describe('ApplicationsPage', () => {
  it('explains how to start when nothing is tracked', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /applications?archived=ACTIVE': { body: [] } });
    renderApp('/applications');
    expect(await screen.findByText('No applications tracked yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to jobs' })).toHaveAttribute('href', '/jobs');
  });

  it('lists applications with the exact resume version used', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /applications?archived=ACTIVE': {
        body: [
          applicationSummary(),
          applicationSummary({
            id: 'ap2',
            jobTitle: 'Full Stack Engineer',
            companyName: 'XYZ',
            status: 'INTERVIEW',
            resume: {
              resumeId: 'r2',
              resumeName: 'Full Stack Resume',
              resumeVersionId: 'v2',
              versionNumber: 2,
            },
            appliedAt: '2026-10-05',
          }),
        ],
      },
    });
    renderApp('/applications');
    const row = (await screen.findByRole('link', { name: 'Full Stack Engineer' })).closest('tr')!;
    expect(within(row).getByText('XYZ')).toBeInTheDocument();
    expect(within(row).getByText('Full Stack Resume')).toBeInTheDocument();
    expect(within(row).getByText('v2')).toBeInTheDocument();
    expect(within(row).getByText('Interview')).toBeInTheDocument();
    expect(within(row).getByText('Oct 5, 2026')).toBeInTheDocument();
  });

  it('filters by status and search through the API, and shows a board', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /applications?archived=ACTIVE': { body: [applicationSummary()] },
      'GET /applications?archived=ACTIVE&status=INTERVIEW': { body: [] },
      'GET /applications?archived=ACTIVE&status=INTERVIEW&q=xyz': { body: [] },
    });
    renderApp('/applications');
    await screen.findByRole('link', { name: 'Frontend Developer' });
    await userEvent.click(screen.getByRole('button', { name: 'Board view' }));
    const applied = screen.getByRole('region', { name: 'Applied' });
    expect(within(applied).getByRole('link', { name: 'Frontend Developer' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Interview' })).queryAllByRole('listitem'),
    ).toHaveLength(0);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'INTERVIEW');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search applications' }), 'xyz');
    await waitFor(() =>
      expect(api.find('GET', '/applications?archived=ACTIVE&status=INTERVIEW&q=xyz')).toHaveLength(
        1,
      ),
    );
    expect(await screen.findByText('No applications match these filters')).toBeInTheDocument();
  });
});
