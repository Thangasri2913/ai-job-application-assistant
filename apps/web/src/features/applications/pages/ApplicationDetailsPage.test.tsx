import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { applicationDetail, meOk, timelineEvents } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

function setup(extra = {}, detail = applicationDetail()) {
  return mockApi({
    'GET /auth/me': meOk,
    'GET /applications/ap1': { body: detail },
    'GET /applications/ap1/timeline': { body: timelineEvents },
    'GET /applications/ap1/notes': {
      body: [
        {
          id: 'n1',
          body: 'Recruiter contacted me on LinkedIn.',
          createdAt: '2026-10-12T10:00:00.000Z',
          updatedAt: '2026-10-12T10:00:00.000Z',
        },
      ],
    },
    'GET /applications/ap1/documents': {
      body: [
        {
          id: 'd1',
          type: 'COVER_LETTER',
          name: 'Cover letter',
          originalFilename: 'cover.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 2048,
          createdAt: '2026-10-12T11:00:00.000Z',
        },
      ],
    },
    ...extra,
  });
}

describe('ApplicationDetailsPage', () => {
  it('distinguishes the AI recommendation from the exact resume version used', async () => {
    setup();
    renderApp('/applications/ap1');
    const resume = (await screen.findByRole('heading', { name: 'Resume' })).closest('section')!;
    expect(within(resume).getByRole('link', { name: 'Full Stack Resume' })).toHaveAttribute(
      'href',
      '/resumes/r2',
    );
    expect(within(resume).getByText('Version 2')).toBeInTheDocument();
    expect(
      within(resume).getByText(
        /This exact version is stored with the application and never changes/,
      ),
    ).toBeInTheDocument();
    expect(within(resume).getByText(/Angular Resume v3 · 86%/)).toBeInTheDocument();
    expect(within(resume).getByText(/you chose a different resume/)).toBeInTheDocument();
    expect(within(resume).getByText('81% when created')).toBeInTheDocument();
  });

  it('warns that a newer version exists while keeping the one used', async () => {
    setup(
      {},
      applicationDetail({
        resumeUsed: { ...applicationDetail().resumeUsed, newerVersionExists: true },
      }),
    );
    renderApp('/applications/ap1');
    expect(await screen.findByText('Newer version exists')).toBeInTheDocument();
    expect(screen.getByText(/this application still uses version 2/)).toBeInTheDocument();
  });

  it('shows the timeline, documents and notes', async () => {
    setup();
    renderApp('/applications/ap1');
    const timeline = await screen.findByRole('list', { name: 'Application timeline' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent('Application created · Saved');
    expect(items[2]).toHaveTextContent('Full Stack Resume v2 selected');
    expect(items[1]).toHaveTextContent('Submitted through company website');
    const docs = screen.getByRole('list', { name: 'Application documents' });
    expect(within(docs).getByText(/Full Stack Resume v2/)).toBeInTheDocument();
    expect(within(docs).getByText('Cover letter')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Notes' })).getByText(
        'Recruiter contacted me on LinkedIn.',
      ),
    ).toBeInTheDocument();
  });

  it('changes status using only the allowed next statuses', async () => {
    const api = setup({
      'POST /applications/ap1/status': { body: applicationDetail({ status: 'INTERVIEW' }) },
    });
    renderApp('/applications/ap1');
    const select = await screen.findByRole('combobox', { name: 'Change to' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual([
      'Choose a status…',
      'Recruiter Screen',
      'Assessment',
      'Interview',
      'Offer',
      'Rejected',
      'Withdrawn',
      'No Response',
    ]);
    expect(options).not.toContain('Saved');
    await userEvent.selectOptions(select, 'INTERVIEW');
    await userEvent.type(
      screen.getByLabelText(/Note for the timeline/),
      'First technical interview scheduled',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Update status' }));
    await waitFor(() => expect(api.find('POST', '/applications/ap1/status')).toHaveLength(1));
    expect(api.find('POST', '/applications/ap1/status')[0]!.body).toEqual({
      status: 'INTERVIEW',
      note: 'First technical interview scheduled',
      rejectionReason: null,
    });
  });

  it('adds and deletes notes', async () => {
    const api = setup({
      'POST /applications/ap1/notes': {
        status: 201,
        body: {
          id: 'n2',
          body: 'HR said feedback next week.',
          createdAt: '2026-10-13T10:00:00.000Z',
          updatedAt: '2026-10-13T10:00:00.000Z',
        },
      },
      'DELETE /applications/ap1/notes/n1': { status: 204 },
    });
    renderApp('/applications/ap1');
    await userEvent.type(await screen.findByLabelText('New note'), 'HR said feedback next week.');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(api.find('POST', '/applications/ap1/notes')[0]?.body).toEqual({
        body: 'HR said feedback next week.',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }));
    await waitFor(() => expect(api.find('DELETE', '/applications/ap1/notes/n1')).toHaveLength(1));
  });

  it('only offers permanent deletion for archived applications', async () => {
    setup();
    renderApp('/applications/ap1');
    await screen.findByRole('button', { name: 'Archive' });
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument();
  });

  it('shows a not-found state for an application the user cannot access', async () => {
    mockApi({ 'GET /auth/me': meOk });
    renderApp('/applications/someone-elses');
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument();
  });
});
