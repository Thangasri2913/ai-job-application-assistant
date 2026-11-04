import type { LearningPreferences, MentorResponse } from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { progress } from '../test/fixtures';

const response = (overrides: Partial<MentorResponse> = {}): MentorResponse => ({
  intent: 'GENERAL_PROGRESS',
  summary: 'You have not started any learning yet — nothing personal is needed to begin.',
  recommendations: [
    {
      type: 'COURSE',
      id: 'javascript-essentials',
      courseId: null,
      title: 'Start with JavaScript essentials',
      reason: 'A beginner course with no prerequisites.',
      href: '/learn/courses/javascript-essentials',
      evidence: ['General suggestion'],
    },
    {
      type: 'LESSON',
      id: 'sql-joins',
      courseId: 'sql-fundamentals',
      title: 'Continue with "Joins"',
      reason: 'You completed the lesson before it.',
      href: '/learn/courses/sql-fundamentals/lessons/sql-joins',
      evidence: [],
    },
  ],
  uncertainty: ['You have not set a target role, so these suggestions are not tailored to a role.'],
  proposedActions: [],
  factsUsed: [{ label: 'Lessons marked complete', value: '0' }],
  toolsUsed: ['catalogue', 'preferences', 'learning_snapshot'],
  source: 'RULES',
  fallbackReason: 'AI_DISABLED',
  followUpQuestion: null,
  explanation: null,
  disclaimer: 'Rule-based guidance from your own JobAssist data — not AI-generated.',
  ...overrides,
});
const prefs: LearningPreferences = {
  targetRole: null,
  interestCategories: ['DATA'],
  interestSkillIds: ['sql'],
  weeklyGoalMinutes: 60,
  dismissedSteps: [],
  updatedAt: '2026-10-19T10:00:00.000Z',
};

describe('Career mentor', () => {
  it('is in the Learn & Prepare navigation and starts with an explanation, not fake history', async () => {
    mockApi({ 'GET /auth/me': meOk });
    renderApp('/learn/mentor');
    expect(
      await screen.findByRole('heading', { name: 'Career mentor', level: 1 }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Learn & Prepare' })).getByRole('link', {
        name: 'Career mentor',
      }),
    ).toHaveAttribute('href', '/learn/mentor');
    expect(
      screen.getByText(
        /only chooses which suggestions to show and in what order; it writes nothing/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing you type is saved/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose a topic and ask' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'How am I doing, and what next?' })).toBeChecked();
  });

  it('asks once, shows the rule-based answer with links and uncertainty, and moves focus to it', async () => {
    const api = mockApi({ 'GET /auth/me': meOk, 'POST /mentor/ask': { body: response() } });
    // Hold the mentor response open so the second click happens while the request is in flight.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const mocked = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/mentor/ask')) await held;
      return mocked(input, init);
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');

    await user.click(await screen.findByRole('radio', { name: 'Plan my learning' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Your question (optional)' }),
      '  SQL please  ',
    );
    expect(screen.getByText(/14\/2000 characters/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Ask the mentor' });
    await user.dblClick(submit);
    expect(submit).toHaveAttribute('aria-busy', 'true');
    release();

    const answer = await screen.findByRole('heading', { name: 'Mentor’s answer' });
    expect(api.find('POST', '/mentor/ask')).toHaveLength(1);
    expect(api.find('POST', '/mentor/ask')[0]?.body).toEqual({
      intent: 'LEARNING_PLAN',
      message: 'SQL please',
    });
    const card = within(answer.closest('section')!);
    expect(card.getByText('Rule-based answer (no AI)')).toBeInTheDocument();
    // AI simply being off is not presented as a failure.
    expect(card.queryByRole('status')).not.toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Start with JavaScript essentials' })).toHaveAttribute(
      'href',
      '/learn/courses/javascript-essentials',
    );
    expect(card.getByRole('link', { name: 'Continue with "Joins"' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/lessons/sql-joins',
    );
    expect(
      card.getByRole('heading', { name: 'What this answer does not know' }),
    ).toBeInTheDocument();
    expect(card.getByText('What this answer is based on')).toBeInTheDocument();
    expect(card.queryByRole('heading', { name: 'Optional actions' })).not.toBeInTheDocument();
    await waitFor(() => expect(answer.closest('[tabindex="-1"]')).toHaveFocus());
  });

  it('lets the user pick one of their analysed jobs for a job comparison', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/jobs': {
        body: {
          jobs: [
            {
              id: '0190f3c2-0000-7000-8000-000000000001',
              title: 'Data Analyst',
              companyName: 'Acme',
              analysedAt: null,
              isSampleData: false,
              skillCount: 4,
            },
          ],
        },
      },
      'POST /mentor/ask': { body: response({ intent: 'JOB_FIT', recommendations: [] }) },
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    expect(
      screen.queryByRole('combobox', { name: 'Job to compare (optional)' }),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: 'How do I compare with a job?' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Job to compare (optional)' }),
      '0190f3c2-0000-7000-8000-000000000001',
    );
    await user.click(screen.getByRole('button', { name: 'Ask the mentor' }));
    await screen.findByRole('heading', { name: 'Mentor’s answer' });
    expect(api.find('POST', '/mentor/ask')[0]?.body).toEqual({
      intent: 'JOB_FIT',
      jobId: '0190f3c2-0000-7000-8000-000000000001',
    });
  });

  it('runs proposed actions only when clicked, through the existing endpoints', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/preferences': { body: prefs },
      'PUT /learning/preferences': (call) => ({ body: { ...prefs, ...(call.body as object) } }),
      'PUT /learning/enrollments/sql-fundamentals': { body: progress({ enrolled: true }) },
      'POST /mentor/ask': {
        body: response({
          proposedActions: [
            {
              type: 'SET_TARGET_ROLE',
              role: 'DATA_ANALYST',
              label: 'Set Data Analyst as my target role',
              description: 'Saves it in your preferences.',
            },
            {
              type: 'ADD_COURSE',
              courseId: 'sql-fundamentals',
              label: 'Add SQL fundamentals to My learning',
              description: 'It teaches SQL.',
            },
          ],
        }),
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    await user.click(await screen.findByRole('button', { name: 'Ask the mentor' }));
    expect(await screen.findByText('Nothing changes unless you click.')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'PUT')).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Add SQL fundamentals to My learning' }));
    expect(await screen.findByRole('button', { name: 'Added to My learning' })).toBeDisabled();
    expect(api.find('PUT', '/learning/enrollments/sql-fundamentals')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Set Data Analyst as my target role' }));
    expect(await screen.findByRole('button', { name: 'Target role saved' })).toBeDisabled();
    // Other preferences are kept.
    expect(api.find('PUT', '/learning/preferences')[0]?.body).toEqual({
      targetRole: 'DATA_ANALYST',
      interestCategories: ['DATA'],
      interestSkillIds: ['sql'],
      weeklyGoalMinutes: 60,
    });
  });

  it('shows errors such as rate limits without losing the question', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'POST /mentor/ask': {
        status: 429,
        body: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment.' },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    await user.type(
      await screen.findByRole('textbox', { name: 'Your question (optional)' }),
      'React',
    );
    await user.click(screen.getByRole('button', { name: 'Ask the mentor' }));
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your question (optional)' })).toHaveValue('React');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      await screen.findByRole('heading', { name: 'Choose a topic and ask' }),
    ).toBeInTheDocument();
  });

  it('labels an AI-ordered answer without calling the fixed wording AI-written, and lets the user reuse the suggested question', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'POST /mentor/ask': {
        body: response({
          source: 'AI',
          fallbackReason: null,
          explanation:
            'The AI put the 2 suggestions JobAssist found for “How am I doing, and what next?” in this order. Every suggestion, reason and link comes from your JobAssist records.',
          followUpQuestion: 'Which skills should I work on next?',
          disclaimer:
            'The summary, facts, reasons and explanation come from your JobAssist records and fixed JobAssist wording; AI only chose which suggestions to show and in what order.',
        }),
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    await user.click(await screen.findByRole('button', { name: 'Ask the mentor' }));
    const card = within(
      (await screen.findByRole('heading', { name: 'Mentor’s answer' })).closest('section')!,
    );
    expect(card.getByText('AI-ordered suggestions · facts from your records')).toBeInTheDocument();
    expect(card.queryByText('Rule-based answer (no AI)')).not.toBeInTheDocument();
    expect(card.getByText(/You have not started any learning yet/)).toBeInTheDocument();
    // The fixed explanation is shown, and nothing on the card claims AI wrote any text.
    expect(card.getByText('About these suggestions')).toBeInTheDocument();
    expect(card.getByText(/The AI put the 2 suggestions JobAssist found/)).toBeInTheDocument();
    expect(card.queryByText(/written by AI/i)).not.toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Use this question' }));
    const box = screen.getByRole('textbox', { name: 'Your question (optional)' });
    expect(box).toHaveValue('Which skills should I work on next?');
    expect(box).toHaveFocus();
    // Filling the box does not send anything by itself.
    expect(api.find('POST', '/mentor/ask')).toHaveLength(1);
  });

  it.each([
    ['AI_TIMEOUT', /took too long/],
    ['AI_UNAVAILABLE', /AI service is unavailable/],
    ['AI_INVALID', /did not pass JobAssist’s checks/],
    ['AI_LIMIT_REACHED', /used your AI answers for now/],
  ] as const)('explains a rule-based fallback (%s)', async (fallbackReason, note) => {
    mockApi({ 'GET /auth/me': meOk, 'POST /mentor/ask': { body: response({ fallbackReason }) } });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    await user.click(await screen.findByRole('button', { name: 'Ask the mentor' }));
    const card = within(
      (await screen.findByRole('heading', { name: 'Mentor’s answer' })).closest('section')!,
    );
    expect(card.getByRole('status')).toHaveTextContent(note);
    expect(card.getByText('Rule-based answer (no AI)')).toBeInTheDocument();
    expect(card.queryByText('About these suggestions')).not.toBeInTheDocument();
  });

  it('never renders a recommendation link outside the app', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'POST /mentor/ask': {
        body: response({
          recommendations: [
            {
              type: 'COURSE',
              id: 'x',
              courseId: null,
              title: 'Suspicious link',
              reason: 'Because.',
              href: 'https://evil.example',
              evidence: [],
            },
          ],
        }),
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/mentor');
    await user.click(await screen.findByRole('button', { name: 'Ask the mentor' }));
    expect(await screen.findByText('Suspicious link')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suspicious link' })).not.toBeInTheDocument();
  });
});
