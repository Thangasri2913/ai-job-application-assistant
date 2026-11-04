import type {
  LearningDashboard,
  LearningPreferences,
  RevisionQueueResponse,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { clearDrafts } from '../activity-session';
import { analytics, courseDetail, readiness } from '../test/fixtures';

beforeEach(() => clearDrafts());

const emptyDashboard = (overrides: Partial<LearningDashboard> = {}): LearningDashboard => ({
  courses: [],
  revision: [],
  nextLesson: null,
  remainingMinutes: 0,
  assessedSkills: [],
  readiness: readiness(),
  analytics: analytics(),
  ...overrides,
});
const noPrefs: LearningPreferences = {
  targetRole: null,
  interestCategories: [],
  interestSkillIds: [],
  weeklyGoalMinutes: null,
  dismissedSteps: [],
  updatedAt: null,
};
const starter = {
  steps: [
    {
      key: 'start:javascript-essentials',
      rank: 1,
      kind: 'START_HERE' as const,
      title: 'Start with JavaScript essentials',
      reason: 'A beginner course with no prerequisites. You do not need a resume or a target role.',
      href: '/learn/courses/javascript-essentials',
      evidence: [
        'General suggestion: there is little learning activity to base a personal one on yet',
      ],
      confidence: 'LOW' as const,
    },
    {
      key: 'start:preferences',
      rank: 2,
      kind: 'START_HERE' as const,
      title: 'Optionally choose a target role or interests',
      reason: 'Suggestions stay general until you do.',
      href: '/learn/my-learning#learning-preferences',
      evidence: [],
      confidence: 'LOW' as const,
    },
  ],
  dismissedCount: 0,
  basedOn: {
    targetRole: null,
    interests: 0,
    hasResume: false,
    analysedJobs: 0,
    practiceAnswers: 0,
    diagnostics: 0,
  },
};
const skills = {
  body: { skills: [{ id: 'sql', name: 'SQL', category: 'DATA', description: '', courseIds: [] }] },
};

describe('My learning for a new user', () => {
  it('shows a general start, honest empty analytics and optional preferences', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': { body: emptyDashboard() },
      'GET /learning/next-steps': { body: starter },
      'GET /learning/preferences': { body: noPrefs },
      'GET /learning/skills': skills,
    });
    renderApp('/learn/my-learning');
    expect(
      await screen.findByRole('heading', { name: 'You have not started any courses yet' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Start with JavaScript essentials')).toBeInTheDocument();
    expect(screen.getByText(/These are general suggestions/)).toBeInTheDocument();
    expect(screen.getAllByText('Little evidence yet')).toHaveLength(2);
    expect(
      screen.getByRole('link', { name: 'Start: Start with JavaScript essentials' }),
    ).toHaveAttribute('href', '/learn/courses/javascript-essentials');

    const stats = within(screen.getByRole('region', { name: 'Your learning so far' }));
    expect(stats.getByText('Not enough data')).toBeInTheDocument();
    expect(stats.getByText(/Answer at least 5 different practice questions/)).toBeInTheDocument();
    expect(stats.getByText('No activity recorded yet.')).toBeInTheDocument();
    expect(stats.getByText(/Choose a target role in your preferences/)).toBeInTheDocument();
    expect(screen.queryByText(/day streak|current streak|streak:/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Target role (optional)' })).toHaveValue('');
  });

  it('lets the user dismiss a suggestion and show dismissed ones again', async () => {
    let dismissed: string[] = [];
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': { body: emptyDashboard() },
      'GET /learning/preferences': { body: noPrefs },
      'GET /learning/skills': skills,
      'GET /learning/next-steps': () => ({
        body: {
          ...starter,
          steps: starter.steps.filter((s) => !dismissed.includes(s.key)),
          dismissedCount: dismissed.length,
        },
      }),
      'POST /learning/next-steps/dismissals': (call) => {
        dismissed = [...dismissed, (call.body as { key: string }).key];
        return {
          body: {
            ...noPrefs,
            dismissedSteps: dismissed.map((key) => ({
              key,
              dismissedAt: '2026-10-19T10:00:00.000Z',
            })),
          },
        };
      },
      'DELETE /learning/next-steps/dismissals': () => {
        dismissed = [];
        return { body: noPrefs };
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/my-learning');
    await user.click(
      await screen.findByRole('button', {
        name: 'Dismiss suggestion: Start with JavaScript essentials',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Start with JavaScript essentials')).not.toBeInTheDocument(),
    );
    expect(api.find('POST', '/learning/next-steps/dismissals')[0]?.body).toEqual({
      key: 'start:javascript-essentials',
    });
    expect(screen.getByText(/1 dismissed suggestion is hidden/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show them again' }));
    expect(await screen.findByText('Start with JavaScript essentials')).toBeInTheDocument();
  });

  it('saves preferences, allows no target role, and reports server validation errors', async () => {
    let saved = noPrefs;
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': { body: emptyDashboard() },
      'GET /learning/next-steps': { body: starter },
      'GET /learning/skills': skills,
      'GET /learning/preferences': () => ({ body: saved }),
      'PUT /learning/preferences': (call) => {
        const body = call.body as LearningPreferences;
        if (body.weeklyGoalMinutes === 300)
          return {
            status: 400,
            body: { code: 'VALIDATION_FAILED', message: 'Request validation failed.' },
          };
        saved = { ...noPrefs, ...body, updatedAt: '2026-10-19T10:00:00.000Z' };
        return { body: saved };
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/my-learning');
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Target role (optional)' }),
      'DATA_ANALYST',
    );
    await user.click(screen.getByRole('checkbox', { name: 'AI and machine learning' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Weekly study goal/ }), '120');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(
      await screen.findByText('Preferences saved. Suggestions now use them.'),
    ).toBeInTheDocument();
    expect(api.find('PUT', '/learning/preferences')[0]?.body).toEqual({
      targetRole: 'DATA_ANALYST',
      interestCategories: ['AI_AND_MACHINE_LEARNING'],
      interestSkillIds: [],
      weeklyGoalMinutes: 120,
    });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Target role (optional)' }), '');
    await user.selectOptions(screen.getByRole('combobox', { name: /Weekly study goal/ }), '300');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByText('Request validation failed.')).toBeInTheDocument();
    expect(api.find('PUT', '/learning/preferences')[1]?.body).toMatchObject({ targetRole: null });
  });
});

describe('Analytics with data', () => {
  it('shows accuracy only with enough questions, with counts, and separates lessons from answers', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/next-steps': { body: starter },
      'GET /learning/preferences': { body: noPrefs },
      'GET /learning/skills': skills,
      'GET /learning/dashboard': {
        body: emptyDashboard({
          analytics: analytics({
            courses: { started: 2, completed: 1 },
            lessonsCompleted: 4,
            practice: {
              attempts: 9,
              questionsAnswered: 6,
              firstTry: { correct: 4, total: 6 },
              firstTryAccuracy: 67,
              note: 'Based on the first answer to each question, so retries do not change it.',
            },
            recentActivity: [
              {
                date: '2026-10-19',
                lessonsCompleted: 1,
                practiceAnswers: 3,
                diagnostics: 0,
                interviewAnswers: 0,
              },
            ],
            skills: { measured: 1, tooFewQuestions: 2, unknown: 3 },
            plan: { role: 'DATA_ANALYST', coreSkills: 4, measured: 1, demonstrated: 1 },
            week: { goalMinutes: 120, estimatedMinutes: 45 },
          }),
        }),
      },
    });
    renderApp('/learn/my-learning');
    const stats = within(await screen.findByRole('region', { name: 'Your learning so far' }));
    expect(stats.getByText('67%')).toBeInTheDocument();
    expect(stats.getByText(/4 of 6 questions/)).toBeInTheDocument();
    expect(stats.getByText('Lessons marked complete')).toBeInTheDocument();
    expect(stats.getByText('6 different questions')).toBeInTheDocument();
    expect(stats.getByText('1 lesson, 3 answers')).toBeInTheDocument();
    expect(
      stats.getByText(
        /Data Analyst: 1 of 4 core skills measured, 1 with fundamentals demonstrated/,
      ),
    ).toBeInTheDocument();
    expect(
      stats.getByText(
        /3 in your courses or target role not assessed yet \(unknown, not mastered\)/,
      ),
    ).toBeInTheDocument();
    expect(stats.getByText(/about 45 min of lessons \(your goal: 2 h\)/)).toBeInTheDocument();
  });
});

describe('Revision page', () => {
  const queue: RevisionQueueResponse = {
    topics: [
      {
        key: 'lesson:sql-fundamentals:sql-select-and-filter',
        kind: 'PRACTICE',
        title: 'SELECT, WHERE and ORDER BY',
        courseId: 'sql-fundamentals',
        lessonId: 'sql-select-and-filter',
        interviewQuestionId: null,
        skillNames: ['SQL'],
        reason:
          'You answered 1 question in this lesson incorrectly (2 incorrect attempts across 2 visits).',
        due: true,
        dueAt: null,
        mistakeSessions: 2,
        activities: [
          {
            activityId: 'sql-which-clause-filters',
            prompt: 'Which clause decides which rows are kept?',
            status: 'DUE',
            dueAt: null,
            reason: 'Your last answer was incorrect (mistakes on 2 separate visits).',
          },
          {
            activityId: 'sql-fill-where-berlin',
            prompt: 'Complete the query.',
            status: 'ALTERNATIVE',
            dueAt: null,
            reason: 'A different question on the same topic that you have not tried yet.',
          },
        ],
      },
      {
        key: 'lesson:sql-fundamentals:sql-joins',
        kind: 'PRACTICE',
        title: 'Joins',
        courseId: 'sql-fundamentals',
        lessonId: 'sql-joins',
        interviewQuestionId: null,
        skillNames: ['SQL'],
        reason:
          'You have corrected your mistakes here; 1 question comes back after 2026-10-20 to check they stuck.',
        due: false,
        dueAt: '2026-10-20T10:00:00.000Z',
        mistakeSessions: 1,
        activities: [],
      },
    ],
    dueCount: 1,
    scheduledCount: 1,
    resolvedCount: 2,
    method: 'A question you answer incorrectly is due now.',
  };

  it('explains why each topic is listed and lets the learner retry and try different questions', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/revision': { body: queue },
      'GET /learning/courses/sql-fundamentals': { body: courseDetail() },
      'POST /learning/courses/sql-fundamentals/activities/sql-which-clause-filters/attempts': {
        status: 201,
        body: {
          activityId: 'sql-which-clause-filters',
          graded: true,
          correct: true,
          score: 1,
          feedback: 'Right.',
          explanation: 'WHERE filters rows.',
          correctAnswer: 'WHERE',
          gapResults: null,
          attemptNumber: 3,
          recordedAt: '2026-10-19T10:00:00.000Z',
        },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/revision');
    expect(
      await screen.findByText(/1 topic is due now, 1 coming back later; 2 cleared so far/),
    ).toBeInTheDocument();
    const due = within(screen.getByRole('article', { name: 'SELECT, WHERE and ORDER BY' }));
    expect(due.getByText('Due now')).toBeInTheDocument();
    expect(due.getByText(/2 incorrect attempts across 2 visits/)).toBeInTheDocument();
    const later = within(screen.getByRole('article', { name: 'Joins' }));
    expect(later.getByText(/Back after/)).toBeInTheDocument();
    expect(later.queryByRole('button', { name: 'Review this topic' })).not.toBeInTheDocument();

    await user.click(due.getByRole('button', { name: 'Review this topic' }));
    expect(await due.findByText('To retry')).toBeInTheDocument();
    expect(due.getByText('Different question')).toBeInTheDocument();
    const activity = within(due.getByRole('region', { name: /Activity 1/ }));
    await user.click(activity.getByRole('radio', { name: 'WHERE' }));
    await user.click(activity.getByRole('button', { name: 'Check answer' }));
    expect(await activity.findByText('Correct')).toBeInTheDocument();
    expect(
      api.find(
        'POST',
        '/learning/courses/sql-fundamentals/activities/sql-which-clause-filters/attempts',
      ),
    ).toHaveLength(1);
    expect(screen.getByText('How the revision list works')).toBeInTheDocument();
  });

  it('opens the topic a suggestion links to', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/revision': { body: queue },
      'GET /learning/courses/sql-fundamentals': { body: courseDetail() },
    });
    renderApp('/learn/revision?topic=lesson%3Asql-fundamentals%3Asql-select-and-filter');
    const due = await screen.findByRole('article', { name: 'SELECT, WHERE and ORDER BY' });
    await waitFor(() => expect(due).toHaveFocus());
    expect(within(due).getByRole('button', { name: 'Hide practice' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('shows a friendly empty state and an error state with retry', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/revision': {
        body: { topics: [], dueCount: 0, scheduledCount: 0, resolvedCount: 3, method: 'Rule.' },
      },
    });
    const { unmount } = renderApp('/learn/revision');
    expect(
      await screen.findByRole('heading', { name: 'Nothing to revise right now' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You have cleared 3 questions you once got wrong/)).toBeInTheDocument();
    unmount();

    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/revision': { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Down.' } },
    });
    renderApp('/learn/revision');
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this' })).toBeInTheDocument();
  });
});
