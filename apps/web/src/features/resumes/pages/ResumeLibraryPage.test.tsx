import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk, resume, version } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

describe('ResumeLibraryPage', () => {
  it('shows a helpful empty state with an upload action', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /resumes?status=ACTIVE': { body: [] } });
    renderApp('/resumes');

    expect(await screen.findByText('You don’t have any resumes yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload resume' })).toBeInTheDocument();
  });

  it('lists resumes with version, default and review status', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': {
        body: [
          resume({ id: 'r1', name: 'Angular Developer', isDefault: true, category: 'Frontend' }),
          resume({
            id: 'r2',
            name: 'Full Stack Developer',
            currentVersion: null,
            latestVersion: version({
              id: 'v9',
              status: 'DRAFT',
              parseStatus: 'NEEDS_REVIEW',
              activatedAt: null,
            }),
          }),
        ],
      },
    });
    renderApp('/resumes');

    const angular = (await screen.findByRole('link', { name: 'Angular Developer' })).closest('li')!;
    expect(within(angular).getByText('Default')).toBeInTheDocument();
    expect(within(angular).getByText(/v1/)).toBeInTheDocument();
    expect(within(angular).getByText(/Frontend ·/)).toBeInTheDocument();
    expect(within(angular).getByText('Ready')).toBeInTheDocument();
    const fullStack = screen.getByRole('link', { name: 'Full Stack Developer' }).closest('li')!;
    expect(within(fullStack).getByText('Review required')).toBeInTheDocument();
    expect(within(fullStack).getByRole('button', { name: 'Set as default' })).toBeInTheDocument();
  });

  it('archives, duplicates and sets a default via the API', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [resume()] },
      'POST /resumes/r1/archive': { body: resume({ status: 'ARCHIVED' }) },
      'POST /resumes/r1/duplicate': {
        status: 201,
        body: resume({ id: 'r2', name: 'Copy of Angular Developer' }),
      },
      'POST /resumes/r1/default': { body: resume({ isDefault: true }) },
    });
    renderApp('/resumes');

    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set as default' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));

    await waitFor(() => {
      expect(api.find('POST', '/resumes/r1/duplicate')).toHaveLength(1);
      expect(api.find('POST', '/resumes/r1/default')).toHaveLength(1);
      expect(api.find('POST', '/resumes/r1/archive')).toHaveLength(1);
    });
  });

  it('switches to archived resumes', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [] },
      'GET /resumes?status=ARCHIVED': {
        body: [resume({ status: 'ARCHIVED', name: 'Old React Resume' })],
      },
    });
    renderApp('/resumes');
    await userEvent.click(await screen.findByRole('tab', { name: 'Archived' }));
    expect(await screen.findByText('Old React Resume')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
  });
  it('searches, filters by category and sorts through the API', async () => {
    const all = [
      resume({ id: 'r1', name: 'Angular Developer', category: 'Frontend' }),
      resume({ id: 'r2', name: 'React Developer', category: 'Frontend' }),
      resume({ id: 'r3', name: 'General Software Developer', category: 'General' }),
    ];
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: all },
      'GET /resumes?status=ACTIVE&q=react': { body: [all[1]] },
      'GET /resumes?status=ACTIVE&q=react&category=Frontend': { body: [all[1]] },
      'GET /resumes?status=ACTIVE&q=react&category=Frontend&sort=name': { body: [all[1]] },
    });
    renderApp('/resumes');
    await screen.findByRole('link', { name: 'General Software Developer' });

    // Category options come from the user's own resumes, de-duplicated and sorted.
    const category = screen.getByRole('combobox', { name: 'Category' });
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All categories', 'Frontend', 'General']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resumes' }), 'react');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Angular Developer' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'React Developer' })).toBeInTheDocument();

    await userEvent.selectOptions(category, 'Frontend');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name');
    await waitFor(() =>
      expect(
        api.find('GET', '/resumes?status=ACTIVE&q=react&category=Frontend&sort=name'),
      ).toHaveLength(1),
    );
  });

  it('tells "no matches" apart from an empty library and can clear filters', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /resumes?status=ACTIVE': { body: [resume()] },
      'GET /resumes?status=ACTIVE&q=python': { body: [] },
    });
    renderApp('/resumes');
    await screen.findByRole('link', { name: 'Angular Developer' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search resumes' }), 'python');
    expect(await screen.findByText('No resumes match your search')).toBeInTheDocument();
    expect(screen.queryByText('You don’t have any resumes yet.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByRole('link', { name: 'Angular Developer' })).toBeInTheDocument();
  });
});
