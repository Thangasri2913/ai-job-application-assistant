import type { LearningDashboard } from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { clearDrafts } from '../activity-session';
import { courseDetail, courseSummary, progress, readiness, analytics } from '../test/fixtures';

beforeEach(() => clearDrafts());

const LESSON = '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter';
const ATTEMPT = '/learning/courses/sql-fundamentals/activities/sql-which-clause-filters/attempts';
const base = {
  'GET /auth/me': meOk,
  'GET /learning/courses': { body: { courses: [courseSummary()] } },
  'GET /learning/courses/sql-fundamentals': { body: courseDetail() },
  'GET /learning/courses/sql-fundamentals/progress': { body: progress() },
};
const wrong = {
  status: 201,
  body: {
    activityId: 'sql-which-clause-filters',
    graded: true,
    correct: false,
    score: 0,
    feedback: 'SELECT chooses columns, not rows.',
    explanation: 'WHERE filters rows.',
    correctAnswer: 'WHERE',
    gapResults: null,
    attemptNumber: 1,
    recordedAt: '2026-10-18T10:00:00.000Z',
  },
};

describe('Activity feedback and drafts', () => {
  it('explains what is missing instead of silently ignoring an empty answer', async () => {
    const api = mockApi(base);
    const user = userEvent.setup();
    renderApp(LESSON);
    const mc = within(await screen.findByRole('region', { name: /Activity 1/ }));
    await user.click(mc.getByRole('button', { name: 'Check answer' }));
    expect(mc.getByRole('alert')).toHaveTextContent('Choose an answer first.');

    const gap = within(screen.getByRole('region', { name: /Activity 2/ }));
    await user.click(gap.getByRole('button', { name: 'Check answer' }));
    expect(gap.getByRole('alert')).toHaveTextContent('Fill in at least one gap first.');
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([]);
  });

  it('moves focus to the feedback, links back to the explanation and keeps the result after leaving the lesson', async () => {
    mockApi({ ...base, [`POST ${ATTEMPT}`]: wrong });
    const user = userEvent.setup();
    const { router } = renderApp(LESSON);
    const mc = within(await screen.findByRole('region', { name: /Activity 1/ }));
    await user.click(mc.getByRole('radio', { name: 'SELECT' }));
    await user.click(mc.getByRole('button', { name: 'Check answer' }));

    const status = await mc.findByRole('status');
    await waitFor(() => expect(status).toHaveFocus());
    expect(within(status).getByRole('link', { name: 'Revisit the explanation' })).toHaveAttribute(
      'href',
      '#section-explanation',
    );

    // Leave and come back: the answer and its feedback are still there.
    await router.navigate('/learn/courses/sql-fundamentals');
    await screen.findByRole('heading', { name: 'SQL fundamentals', level: 1 });
    await router.navigate(LESSON);
    const again = within(await screen.findByRole('region', { name: /Activity 1/ }));
    expect(again.getByText('Not quite')).toBeInTheDocument();
    expect(again.getByRole('radio', { name: 'SELECT' })).toBeChecked();
  });

  it('keeps an unchecked draft when moving between lessons', async () => {
    mockApi(base);
    const user = userEvent.setup();
    const { router } = renderApp(LESSON);
    const gap = within(await screen.findByRole('region', { name: /Activity 2/ }));
    await user.type(gap.getByRole('textbox', { name: 'filter keyword' }), 'WHERE');
    await router.navigate('/learn/courses/sql-fundamentals/lessons/sql-joins');
    await screen.findByRole('heading', { name: 'Joins', level: 1 });
    await router.navigate(LESSON);
    const back = within(await screen.findByRole('region', { name: /Activity 2/ }));
    expect(back.getByRole('textbox', { name: 'filter keyword' })).toHaveValue('WHERE');
  });
});

describe('Lesson progress states', () => {
  it('explains why the diagnostic suggests skimming and announces completion', async () => {
    let completed: string[] = [];
    const diagnostic = {
      attemptId: 'a1',
      courseId: 'sql-fundamentals',
      score: 1,
      maxScore: 1,
      completedAt: '2026-10-18T10:00:00.000Z',
      topics: [
        {
          lessonId: 'sql-select-and-filter',
          lessonTitle: 'SELECT',
          correct: 1,
          total: 1,
          recommendation: 'SKIM' as const,
        },
      ],
      questions: [],
      skills: [],
    };
    const current = () => ({
      body: progress({
        enrolled: true,
        completedLessonIds: completed,
        skimLessonIds: completed.length ? [] : ['sql-select-and-filter'],
        latestDiagnostic: diagnostic,
      }),
    });
    mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/progress': current,
      'PUT /learning/courses/sql-fundamentals/lessons/sql-select-and-filter/completion': () => {
        completed = ['sql-select-and-filter'];
        return current();
      },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    expect(
      await screen.findByText(/you answered 1 of 1 question on this topic correctly/),
    ).toBeInTheDocument();
    expect(screen.getByText(/not proof of mastery/)).toBeInTheDocument();
    expect(
      screen.getByText(/You have not answered 2 of the 2 practice activities yet/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark lesson complete' }));
    expect(await screen.findByText('Lesson marked complete. Next: Joins.')).toBeInTheDocument();
  });

  it('shows when progress cannot be loaded, offers a retry and blocks completion meanwhile', async () => {
    let fail = true;
    mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/progress': () =>
        fail
          ? { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Oops' } }
          : { body: progress() },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    expect(
      await screen.findByText(/Your progress for this course could not be loaded/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark lesson complete' })).toBeDisabled();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Mark lesson complete' })).toBeEnabled(),
    );
  });
});

describe('Diagnostic answers', () => {
  const diagnostic = {
    courseId: 'sql-fundamentals',
    title: 'SQL starting point',
    instructions: 'Answer what you know.',
    questions: [
      {
        id: 'q1',
        lessonId: 'sql-select-and-filter',
        prompt: 'First question?',
        code: null,
        options: [
          { id: 'a', text: 'Yes' },
          { id: 'b', text: 'No' },
        ],
      },
      {
        id: 'q2',
        lessonId: 'sql-joins',
        prompt: 'Second question?',
        code: null,
        options: [
          { id: 'a', text: 'Left' },
          { id: 'b', text: 'Inner' },
        ],
      },
    ],
  };

  it('asks for at least one answer, and keeps answers when the learner leaves and returns', async () => {
    const api = mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/diagnostic': { body: diagnostic },
    });
    const user = userEvent.setup();
    const { router } = renderApp('/learn/courses/sql-fundamentals/diagnostic');
    await user.click(await screen.findByRole('button', { name: 'See my results' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Answer at least one question');
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([]);

    await user.click(screen.getByRole('radio', { name: 'Yes' }));
    await router.navigate('/learn/courses/sql-fundamentals');
    await screen.findByRole('heading', { name: 'SQL fundamentals', level: 1 });
    await router.navigate('/learn/courses/sql-fundamentals/diagnostic');
    expect(await screen.findByRole('radio', { name: 'Yes' })).toBeChecked();
  });

  it('distinguishes skipped questions from wrong ones and explains each recommendation', async () => {
    mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/diagnostic': { body: diagnostic },
      'POST /learning/courses/sql-fundamentals/diagnostic/attempts': {
        status: 201,
        body: {
          attemptId: 'x',
          courseId: 'sql-fundamentals',
          score: 1,
          maxScore: 2,
          completedAt: '2026-10-18T10:00:00.000Z',
          topics: [
            {
              lessonId: 'sql-select-and-filter',
              lessonTitle: 'SELECT basics',
              correct: 1,
              total: 1,
              recommendation: 'SKIM',
            },
            {
              lessonId: 'sql-joins',
              lessonTitle: 'Joins',
              correct: 0,
              total: 1,
              recommendation: 'STUDY',
            },
          ],
          questions: [
            {
              questionId: 'q1',
              answered: true,
              correct: true,
              correctOptionId: 'a',
              explanation: 'Because.',
            },
            {
              questionId: 'q2',
              answered: false,
              correct: false,
              correctOptionId: 'a',
              explanation: 'Left keeps rows.',
            },
          ],
          skills: [],
        },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/courses/sql-fundamentals/diagnostic');
    await user.click(await screen.findByRole('radio', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'See my results' }));
    const results = await screen.findByRole('status');
    await waitFor(() => expect(results).toHaveFocus());
    expect(
      within(results).getByText(/1 of 1 question correct. Skim this lesson/),
    ).toBeInTheDocument();
    expect(
      within(results).getByText(/skipped questions count as not yet known/),
    ).toBeInTheDocument();
    expect(within(results).getByLabelText('Not answered')).toBeInTheDocument();
  });
});

describe('Progress shown across the learn pages', () => {
  const dashboard: LearningDashboard = {
    analytics: analytics(),
    readiness: readiness(),
    courses: [
      {
        course: courseSummary(),
        progress: progress({ enrolled: true, completedLessonIds: ['sql-joins'] }),
      },
    ],
    revision: [
      {
        courseId: 'sql-fundamentals',
        courseTitle: 'SQL fundamentals',
        lessonId: 'sql-select-and-filter',
        lessonTitle: 'SELECT, WHERE and ORDER BY',
        activityId: 'sql-which-clause-filters',
        prompt: 'Which clause decides which rows are kept?',
      },
    ],
    nextLesson: progress().nextLesson,
    remainingMinutes: 25,
    assessedSkills: [
      {
        skillId: 'sql',
        name: 'SQL',
        correct: 5,
        total: 6,
        sufficient: true,
        assessedAt: '2026-10-18T10:00:00.000Z',
      },
      {
        skillId: 'postgresql',
        name: 'PostgreSQL',
        correct: 1,
        total: 1,
        sufficient: false,
        assessedAt: '2026-10-18T10:00:00.000Z',
      },
    ],
  };

  it('marks courses already in progress in the catalogue', async () => {
    mockApi({
      ...base,
      'GET /learning/skills': { body: { skills: [] } },
      'GET /learning/dashboard': { body: dashboard },
    });
    renderApp('/learn');
    const card = within(await screen.findByRole('article', { name: 'SQL fundamentals' }));
    expect(await card.findByText(/In my learning · 1 of 2 lessons/)).toBeInTheDocument();
    expect(card.getByRole('link', { name: 'Continue SQL fundamentals' })).toBeInTheDocument();
    expect(screen.getByText('1 course found')).toBeInTheDocument();
  });

  it('links revision items to the exact activity and flags skills with too few questions', async () => {
    mockApi({ 'GET /auth/me': meOk, 'GET /learning/dashboard': { body: dashboard } });
    renderApp('/learn/my-learning');
    const links = await screen.findAllByRole('link', { name: 'SELECT, WHERE and ORDER BY' });
    expect(links.map((l) => l.getAttribute('href'))).toContain(
      '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter#activity-sql-which-clause-filters',
    );
    const postgres = screen.getByText('PostgreSQL').closest('li')!;
    expect(within(postgres).getByText('Too few questions to measure')).toBeInTheDocument();
    const sql = screen.getByText('SQL', { selector: 'span' }).closest('li')!;
    expect(within(sql).queryByText('Too few questions to measure')).not.toBeInTheDocument();
  });
});
