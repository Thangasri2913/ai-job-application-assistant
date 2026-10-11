import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk, resume, version } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const v1 = version({ id: 'v1', versionNumber: 1, status: 'ARCHIVED' });
const v2 = version({
  id: 'v2',
  versionNumber: 2,
  status: 'ACTIVE',
  source: 'MANUAL_EDIT',
  hasFile: true,
});
const detail = resume({
  versionCount: 2,
  currentVersion: v2,
  latestVersion: v2,
  versions: [v2, v1],
});
const versionDetail = {
  ...v2,
  file: { originalFilename: 'angular.pdf', mimeType: 'application/pdf', sizeBytes: 20480 },
  parseError: null,
  parsedAt: null,
  contentConfirmedAt: '2026-10-01T00:00:00Z',
  content: {
    contact: {
      fullName: 'Priya Sharma',
      email: null,
      phone: null,
      location: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
    },
    headline: 'Senior Angular Developer',
    summary: 'Angular developer.',
    skills: [{ name: 'Angular', category: 'FRONTEND' }],
    experiences: [],
    educations: [],
    projects: [],
    certifications: [],
    achievements: [],
    languages: ['English'],
    estimatedYearsOfExperience: null,
  },
};

const extracted = {
  versionId: 'v2',
  versionNumber: 2,
  versionStatus: 'ACTIVE',
  parseStatus: 'NOT_APPLICABLE',
  parseError: null,
  parserVersion: null,
  extractedText: 'Priya Sharma\nSKILLS\nAngular',
  parsed: {
    ...versionDetail.content,
    skills: [{ name: 'Angular', category: 'FRONTEND' }],
    summary: null,
  },
  ai: null,
  aiStatus: 'DISABLED',
  aiNote: null,
  confirmed: versionDetail.content,
  editable: false,
};

function setup(extra = {}) {
  return mockApi({
    'GET /auth/me': meOk,
    'GET /resumes/r1': { body: detail },
    'GET /resumes/r1/versions/v2': { body: versionDetail },
    'GET /resumes/r1/versions/v2/extracted-data': { body: extracted },
    ...extra,
  });
}

describe('ResumeDetailPage', () => {
  it('shows the current version content and the full version history', async () => {
    setup();
    renderApp('/resumes/r1');

    expect(await screen.findByRole('heading', { name: 'Angular Developer' })).toBeInTheDocument();
    expect(await screen.findByText('Angular developer.')).toBeInTheDocument();
    expect(screen.getByText(/angular\.pdf · 20 KB/)).toBeInTheDocument();
    const history = screen.getByRole('heading', { name: 'Version history' }).closest('section')!;
    expect(within(history).getByText('v2')).toBeInTheDocument();
    expect(within(history).getByText('Current')).toBeInTheDocument();
    expect(within(history).getByText('Superseded')).toBeInTheDocument();
  });

  it('requires confirmation before deleting', async () => {
    const api = setup({
      'DELETE /resumes/r1': { status: 204 },
      'GET /resumes?status=ACTIVE': { body: [] },
    });
    const { router } = renderApp('/resumes/r1');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/permanently deletes the resume, all 2 versions/),
    ).toBeInTheDocument();
    expect(api.find('DELETE', '/resumes/r1')).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/resumes'));
    expect(api.find('DELETE', '/resumes/r1')).toHaveLength(1);
  });

  it('creates a new draft version and opens it for review', async () => {
    const api = setup({
      'POST /resumes/r1/versions': {
        status: 201,
        body: { ...versionDetail, id: 'v3', versionNumber: 3, status: 'DRAFT' },
      },
    });
    const { router } = renderApp('/resumes/r1');

    await userEvent.click(await screen.findByRole('button', { name: 'Edit information' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/resumes/r1/versions/v3/review'),
    );
    expect(api.find('POST', '/resumes/r1/versions')).toHaveLength(1);
  });

  it('sets the resume as default', async () => {
    const api = setup({ 'POST /resumes/r1/default': { body: { ...detail, isDefault: true } } });
    renderApp('/resumes/r1');
    await userEvent.click(await screen.findByRole('button', { name: 'Set as default' }));
    await waitFor(() => expect(api.find('POST', '/resumes/r1/default')).toHaveLength(1));
  });

  it('shows a not-found state for a resume the user cannot access', async () => {
    mockApi({ 'GET /auth/me': meOk });
    renderApp('/resumes/someone-elses');
    expect(await screen.findByText('Couldn’t load this')).toBeInTheDocument();
  });

  it('shows parsing information, including how AI was used', async () => {
    setup();
    renderApp('/resumes/r1');
    const panel = (await screen.findByRole('heading', { name: 'Parsing information' })).closest(
      'section',
    )!;
    expect(within(panel).getByText('Not used (no AI provider configured)')).toBeInTheDocument();
    expect(within(panel).getByText('Text extracted from the file')).toBeInTheDocument();
  });

  it('shows where the current content came from', async () => {
    setup();
    renderApp('/resumes/r1');
    expect(await screen.findByText(/Highlighted skills were added by you/)).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
  });
  it('labels each version as extracted, AI interpreted and/or confirmed by the user', async () => {
    const draft = version({
      id: 'v3',
      versionNumber: 3,
      status: 'DRAFT',
      parseStatus: 'NEEDS_REVIEW',
      hasAiExtraction: true,
      contentConfirmedAt: null,
      activatedAt: null,
    });
    const confirmedUpload = version({ id: 'v2', versionNumber: 2, hasFile: true });
    setup({
      'GET /resumes/r1': {
        body: resume({
          versionCount: 3,
          currentVersion: confirmedUpload,
          latestVersion: draft,
          versions: [draft, confirmedUpload],
        }),
      },
      'GET /resumes/r1/versions/v3/extracted-data': {
        body: { ...extracted, versionId: 'v3', versionNumber: 3, editable: true },
      },
    });
    renderApp('/resumes/r1');

    const history = (await screen.findByRole('heading', { name: 'Version history' })).closest(
      'section',
    )!;
    const rows = within(history).getAllByRole('listitem');
    const labels = (row: HTMLElement) =>
      within(within(row).getByLabelText('Information source'))
        .queryAllByText(/./)
        .map((el) => el.textContent);
    expect(labels(rows[0]!)).toEqual([
      'Extracted from file',
      'AI interpreted',
      'Not confirmed yet',
    ]);
    expect(labels(rows[1]!)).toEqual(['Extracted from file', 'Confirmed by you']);
  });

  it('shows the headline with the summary', async () => {
    setup();
    renderApp('/resumes/r1');
    expect(await screen.findByText('Senior Angular Developer')).toBeInTheDocument();
  });
});
