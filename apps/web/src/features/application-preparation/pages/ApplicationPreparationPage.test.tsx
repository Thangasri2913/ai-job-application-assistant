import type {
  ApplicationPreparationDetail,
  ApplicationQuestionItem,
  CoverLetterVersionItem,
  ResumeSuggestionItem,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const BASE = '/applications/ap1';

const prep = (o: Partial<ApplicationPreparationDetail> = {}): ApplicationPreparationDetail => ({
  id: 'p1',
  applicationId: 'ap1',
  status: 'READY',
  approvedAt: null,
  aiEnabled: false,
  busyOperation: null,
  job: { id: 'j1', title: 'Frontend Developer', companyName: 'ABC Technologies' },
  resume: { resumeId: 'r1', resumeName: 'Angular Resume', resumeVersionId: 'v3', versionNumber: 3 },
  match: {
    score: 86,
    level: 'EXCELLENT',
    strengths: [],
    gaps: ['Required skills not found: Docker'],
  },
  suggestions: { total: 2, pending: 2, accepted: 0, edited: 0, rejected: 0 },
  coverLetter: null,
  questions: { total: 1, approved: 0 },
  blockers: ['2 resume suggestions still need a decision'],
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  ...o,
});

const suggestion = (o: Partial<ResumeSuggestionItem>): ResumeSuggestionItem => ({
  id: 's1',
  kind: 'REWRITE',
  section: 'EXPERIENCE',
  originalText: 'Developed dashboards for industrial IoT applications.',
  suggestedText:
    'Developed interactive dashboards for an industrial IoT platform, enabling users to monitor devices.',
  userText: null,
  reason: 'This better highlights the dashboard requirement.',
  jobRequirement: 'Dashboards',
  confidence: 0.9,
  source: 'AI',
  status: 'PENDING',
  decidedAt: null,
  createdAt: '2026-10-11T09:00:00.000Z',
  ...o,
});

const gap = suggestion({
  id: 's2',
  kind: 'GAP',
  section: 'SKILLS',
  originalText: null,
  suggestedText: null,
  reason:
    'The job requires Docker, but no Docker experience was found in this resume or your career profile. Do not add Docker unless you genuinely have this experience.',
  jobRequirement: 'Docker',
  source: 'RULES',
  confidence: null,
});

const letter = (o: Partial<CoverLetterVersionItem> = {}): CoverLetterVersionItem => ({
  id: 'c1',
  versionNumber: 1,
  source: 'TEMPLATE',
  generatedText:
    'Dear Hiring Team,\n\nI am applying for the Frontend Developer position at ABC Technologies.\n\nRegards,\nThanga Sri',
  text: 'Dear Hiring Team,\n\nI am applying for the Frontend Developer position at ABC Technologies.\n\nRegards,\nThanga Sri',
  status: 'GENERATED',
  note: 'AI is not configured on this server, so this was built only from your verified data.',
  notClaimed: ['Docker'],
  approvedAt: null,
  documentId: null,
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  ...o,
});

const question = (o: Partial<ApplicationQuestionItem> = {}): ApplicationQuestionItem => ({
  id: 'q1',
  question: 'Describe your experience with Angular. (Maximum 10 words)',
  questionType: 'EXPERIENCE',
  maxWords: 10,
  maxCharacters: null,
  suggestedAnswer: 'I built Angular dashboards at Acme.',
  answerSource: 'RULES',
  insufficientInformation: false,
  missingInformation: [],
  assumptions: [],
  note: null,
  userAnswer: null,
  status: 'GENERATED',
  approvedAt: null,
  generatedAt: '2026-10-11T09:00:00.000Z',
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  ...o,
});

function setup(extra = {}) {
  return mockApi({
    'GET /auth/me': meOk,
    [`POST ${BASE}/preparation`]: { body: prep() },
    [`GET ${BASE}/preparation/resume-suggestions`]: {
      body: {
        suggestions: [suggestion({}), gap],
        note: null,
        generatedAt: '2026-10-11T09:00:00.000Z',
      },
    },
    [`GET ${BASE}/preparation/cover-letter`]: { body: { latest: null, versions: [] } },
    [`GET ${BASE}/questions`]: { body: [question()] },
    ...extra,
  });
}

describe('ApplicationPreparationPage', () => {
  it('shows the exact resume version, the match and what still needs review', async () => {
    setup();
    renderApp(`${BASE}/preparation`);
    const resume = (await screen.findByRole('heading', { name: 'Selected resume' })).closest(
      'section',
    )!;
    expect(within(resume).getByRole('link', { name: 'Angular Resume' })).toBeInTheDocument();
    expect(within(resume).getByText('v3')).toBeInTheDocument();
    expect(within(resume).getByText(/never modified/)).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(screen.getByText('Needs your review')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Still to review' })).getByText(
        '2 resume suggestions still need a decision',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/AI isn’t configured on this server/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve as application-ready' }),
    ).not.toBeInTheDocument();
  });

  it('shows Original, Suggested and Why, and records the user’s decisions', async () => {
    const api = setup({
      [`PATCH ${BASE}/preparation/resume-suggestions/s1`]: {
        body: suggestion({ status: 'EDITED' }),
      },
      [`PATCH ${BASE}/preparation/resume-suggestions/s2`]: { body: { ...gap, status: 'ACCEPTED' } },
    });
    renderApp(`${BASE}/preparation`);
    const cards = within(
      await screen.findByRole('list', { name: 'Resume suggestions' }),
    ).getAllByRole('listitem');
    const rewrite = cards[0]!;
    expect(within(rewrite).getByText('Original')).toBeInTheDocument();
    expect(
      within(rewrite).getByText('Developed dashboards for industrial IoT applications.'),
    ).toBeInTheDocument();
    expect(within(rewrite).getByText(/Developed interactive dashboards/)).toBeInTheDocument();
    expect(
      within(rewrite).getByText('This better highlights the dashboard requirement.'),
    ).toBeInTheDocument();
    expect(within(rewrite).getByText('AI generated')).toBeInTheDocument();

    await userEvent.click(within(rewrite).getByRole('button', { name: 'Edit' }));
    const box = within(rewrite).getByLabelText('Your wording');
    await userEvent.clear(box);
    await userEvent.type(box, 'Developed dashboards for an IoT platform.');
    await userEvent.click(within(rewrite).getByRole('button', { name: 'Save my version' }));
    await waitFor(() =>
      expect(api.find('PATCH', `${BASE}/preparation/resume-suggestions/s1`)).toHaveLength(1),
    );
    expect(api.find('PATCH', `${BASE}/preparation/resume-suggestions/s1`)[0]!.body).toEqual({
      action: 'EDIT',
      text: 'Developed dashboards for an IoT platform.',
    });

    // A gap is informational: it can be acknowledged or dismissed, never "edited" into a claim.
    const g = cards[1]!;
    expect(within(g).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(
      within(g).getByText(/Do not add Docker unless you genuinely have this experience/),
    ).toBeInTheDocument();
    await userEvent.click(within(g).getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() =>
      expect(api.find('PATCH', `${BASE}/preparation/resume-suggestions/s2`)[0]?.body).toEqual({
        action: 'ACCEPT',
      }),
    );
  });

  it('generates, edits and approves a cover letter, showing what is not claimed', async () => {
    let current: CoverLetterVersionItem | null = null;
    const api = setup({
      [`GET ${BASE}/preparation/cover-letter`]: () => ({
        body: { latest: current, versions: current ? [current] : [] },
      }),
      [`POST ${BASE}/preparation/cover-letter`]: () => (
        (current = letter()),
        { body: { latest: current, versions: [current] } }
      ),
      [`PATCH ${BASE}/preparation/cover-letter`]: ({ body }: { body: unknown }) => (
        (current = letter({
          text: (body as { text: string }).text,
          status: 'EDITED',
          updatedAt: '2026-10-11T10:00:00.000Z',
        })),
        { body: { latest: current, versions: [current] } }
      ),
      [`POST ${BASE}/preparation/cover-letter/approve`]: () => (
        (current = letter({
          ...current!,
          status: 'APPROVED',
          approvedAt: '2026-10-11T10:05:00.000Z',
          documentId: 'd1',
          updatedAt: '2026-10-11T10:05:00.000Z',
        })),
        { body: { latest: current, versions: [current] } }
      ),
    });
    renderApp(`${BASE}/preparation`);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate cover letter' }));
    const box = await screen.findByRole('textbox', { name: 'Cover letter' });
    expect(box).toHaveValue(letter().text);
    expect(
      screen.getByText(/Not claimed \(not found in your resume or profile\):/),
    ).toHaveTextContent('Docker');
    expect(screen.getByText('Draft from your verified data')).toBeInTheDocument();

    await userEvent.type(box, '\nThank you.');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled(); // save first
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(api.find('PATCH', `${BASE}/preparation/cover-letter`)).toHaveLength(1),
    );
    expect(await screen.findByText('User edited')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/added to this application’s documents/)).toBeInTheDocument();
    expect(screen.getByText('User approved')).toBeInTheDocument();
  });

  it('keeps the user’s answer separate from the suggestion and shows the word limit', async () => {
    const api = setup({
      [`PATCH ${BASE}/questions/q1`]: { body: question({ userAnswer: 'x', status: 'EDITED' }) },
    });
    renderApp(`${BASE}/preparation`);
    const card = within(
      await screen.findByRole('list', { name: 'Application questions' }),
    ).getAllByRole('listitem')[0]!;
    expect(within(card).getByText('Max 10 words')).toBeInTheDocument();
    expect(within(card).getByText('Suggested answer')).toBeInTheDocument();
    expect(within(card).getByText('6 / 10 words')).toBeInTheDocument(); // the suggestion, until you write your own

    const box = within(card).getByLabelText('Your answer');
    await userEvent.type(box, 'one two three four five six seven eight nine ten eleven');
    expect(within(card).getByText('11 / 10 words — over the limit')).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.click(
      within(card).getByRole('button', { name: 'Use suggestion as my answer' }),
    );
    expect(box).toHaveValue('I built Angular dashboards at Acme.');
    await userEvent.type(box, ' Since 2022.');
    await userEvent.click(within(card).getByRole('button', { name: 'Save answer' }));
    await waitFor(() =>
      expect(api.find('PATCH', `${BASE}/questions/q1`)[0]?.body).toEqual({
        userAnswer: 'I built Angular dashboards at Acme. Since 2022.',
      }),
    );
  });

  it('says plainly when there is not enough verified information', async () => {
    setup({
      [`GET ${BASE}/questions`]: {
        body: [
          question({
            question: 'Why do you want to work here?',
            questionType: 'MOTIVATION',
            maxWords: null,
            suggestedAnswer:
              'I don’t have enough verified information to answer this accurately. Please provide additional information.',
            insufficientInformation: true,
            missingInformation: [
              'Your personal reasons for this role and company — only you can provide these',
            ],
          }),
        ],
      },
    });
    renderApp(`${BASE}/preparation`);
    expect(await screen.findByText(/I don’t have enough verified information/)).toBeInTheDocument();
    expect(screen.getByText(/only you can provide these/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use suggestion as my answer' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve suggestion' })).toBeDisabled();
  });

  it('offers explicit approval only once everything is reviewed', async () => {
    const api = setup({
      [`POST ${BASE}/preparation`]: { body: prep({ status: 'REVIEWED', blockers: [] }) },
      [`POST ${BASE}/preparation/approve`]: {
        body: prep({ status: 'APPROVED', blockers: [], approvedAt: '2026-10-11T11:00:00.000Z' }),
      },
    });
    renderApp(`${BASE}/preparation`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve as application-ready' }),
    );
    await waitFor(() => expect(api.find('POST', `${BASE}/preparation/approve`)).toHaveLength(1));
  });

  it('pauses generation while another one runs', async () => {
    setup({ [`POST ${BASE}/preparation`]: { body: prep({ busyOperation: 'cover-letter' }) } });
    renderApp(`${BASE}/preparation`);
    expect(
      await screen.findByText(/Something is being generated for this application/),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Regenerate suggestions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generate cover letter' })).toBeDisabled();
  });
});
