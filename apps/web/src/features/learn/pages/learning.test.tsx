import type { DiagnosticAssessment, DiagnosticResult, LearningDashboard } from '@job-assist/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { clearDrafts } from '../activity-session';
import {
  courseDetail,
  courseSummary,
  progress,
  readiness,
  analytics,
  nextSteps,
} from '../test/fixtures';

beforeEach(() => clearDrafts());

const LESSON = '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter';
const base = {
  'GET /auth/me': meOk,
  'GET /learning/courses/sql-fundamentals': { body: courseDetail() },
  'GET /learning/courses/sql-fundamentals/progress': { body: progress() },
};
const attempt = '/learning/courses/sql-fundamentals/activities/sql-which-clause-filters/attempts';

describe('Lesson', () => {
  it('teaches in short steps: explanation, deeper dive, example with expected output, recap and resources', async () => {
    mockApi(base);
    renderApp(LESSON);
    expect(
      await screen.findByRole('heading', { name: 'SELECT, WHERE and ORDER BY', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('A query names the columns you want.')).toBeInTheDocument();
    expect(screen.getByText('Go deeper')).toBeInTheDocument();
    expect(screen.getByText('Expected output')).toBeInTheDocument();
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
    expect(screen.getByText('WHERE keeps rows.')).toBeInTheDocument();
    expect(screen.getByText('Level 1: Fundamentals')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /PostgreSQL tutorial/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: /Next: Joins/ })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/lessons/sql-joins',
    );
  });

  it('checks a multiple-choice answer on the server and explains why it is wrong, then allows a retry', async () => {
    const api = mockApi({
      ...base,
      [`POST ${attempt}`]: (call) => {
        const correct = (call.body as { answer: { optionId: string } }).answer.optionId === 'b';
        return {
          status: 201,
          body: {
            activityId: 'sql-which-clause-filters',
            graded: true,
            correct,
            score: correct ? 1 : 0,
            feedback: correct ? 'Right — WHERE keeps rows.' : 'SELECT chooses columns, not rows.',
            explanation: 'WHERE filters rows.',
            correctAnswer: 'WHERE',
            gapResults: null,
            attemptNumber: 1,
            recordedAt: '2026-10-17T10:00:00.000Z',
          },
        };
      },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    const activity = within(
      await screen.findByRole('region', { name: /Activity 1 · Knowledge check/ }),
    );

    await user.click(activity.getByRole('button', { name: 'Show hint' }));
    expect(activity.getByText('It tests a condition.')).toBeInTheDocument();

    await user.click(activity.getByRole('radio', { name: 'SELECT' }));
    await user.click(activity.getByRole('button', { name: 'Check answer' }));
    const status = await activity.findByRole('status');
    expect(within(status).getByText('Not quite')).toBeInTheDocument();
    expect(within(status).getByText('SELECT chooses columns, not rows.')).toBeInTheDocument();
    expect(within(status).getByText('WHERE')).toBeInTheDocument();
    expect(api.find('POST', attempt)[0]?.body).toEqual({
      answer: { type: 'MULTIPLE_CHOICE', optionId: 'a' },
    });

    await user.click(activity.getByRole('button', { name: 'Try again' }));
    await user.click(activity.getByRole('radio', { name: 'WHERE' }));
    await user.click(activity.getByRole('button', { name: 'Check answer' }));
    expect(await activity.findByText('Correct')).toBeInTheDocument();
  });

  it('submits fill-in-the-gap answers by gap', async () => {
    const url = '/learning/courses/sql-fundamentals/activities/sql-fill-where-berlin/attempts';
    const api = mockApi({
      ...base,
      [`POST ${url}`]: {
        status: 201,
        body: {
          activityId: 'sql-fill-where-berlin',
          graded: true,
          correct: true,
          score: 1,
          feedback: 'Correct.',
          explanation: 'WHERE filters.',
          correctAnswer: "SELECT title FROM jobs WHERE city = 'Berlin';",
          gapResults: [{ gapId: 'clause', correct: true, expected: 'WHERE' }],
          attemptNumber: 1,
          recordedAt: '2026-10-17T10:00:00.000Z',
        },
      },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    const activity = within(
      await screen.findByRole('region', { name: /Activity 2 · Fill in the gap/ }),
    );
    await user.type(activity.getByRole('textbox', { name: 'filter keyword' }), 'WHERE');
    await user.click(activity.getByRole('button', { name: 'Check answer' }));
    expect(await activity.findByText('Correct')).toBeInTheDocument();
    expect(api.find('POST', url)[0]?.body).toEqual({
      answer: { type: 'FILL_IN_THE_GAP', gaps: { clause: 'WHERE' } },
    });
  });

  it('keeps revision cards and reflections local — nothing is sent', async () => {
    const api = mockApi(base);
    const user = userEvent.setup();
    renderApp(LESSON);
    const cards = within(await screen.findByRole('region', { name: /Revision cards/ }));
    await user.click(cards.getByRole('button', { name: 'Show answer' }));
    expect(cards.getByText('Unknown')).toBeInTheDocument();
    const reflection = within(screen.getByRole('region', { name: /Reflection/ }));
    await user.type(
      reflection.getByRole('textbox', { name: /not saved or sent/ }),
      'private notes',
    );
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('shows an error if an answer cannot be recorded', async () => {
    mockApi({
      ...base,
      [`POST ${attempt}`]: {
        status: 400,
        body: { code: 'BAD_REQUEST', message: 'Choose one of the listed options.' },
      },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    const activity = within(await screen.findByRole('region', { name: /Activity 1/ }));
    await user.click(activity.getByRole('radio', { name: 'WHERE' }));
    await user.click(activity.getByRole('button', { name: 'Check answer' }));
    expect(await activity.findByText('Choose one of the listed options.')).toBeInTheDocument();
  });

  it('marks the lesson complete', async () => {
    let completed: string[] = [];
    const current = () => ({
      body: progress({ enrolled: completed.length > 0, completedLessonIds: completed }),
    });
    const api = mockApi({
      ...base,
      'GET /learning/courses/sql-fundamentals/progress': current,
      'PUT /learning/courses/sql-fundamentals/lessons/sql-select-and-filter/completion': () => {
        completed = ['sql-select-and-filter'];
        return current();
      },
    });
    const user = userEvent.setup();
    renderApp(LESSON);
    await user.click(await screen.findByRole('button', { name: 'Mark lesson complete' }));
    expect(
      await screen.findByRole('button', { name: /Marked complete/, pressed: true }),
    ).toBeInTheDocument();
    expect(
      api.find(
        'PUT',
        '/learning/courses/sql-fundamentals/lessons/sql-select-and-filter/completion',
      ),
    ).toHaveLength(1);
  });

  it('shows not found for a lesson outside the course', async () => {
    mockApi(base);
    renderApp('/learn/courses/sql-fundamentals/lessons/nope');
    expect(await screen.findByRole('heading', { name: 'Lesson not found' })).toBeInTheDocument();
  });
});

describe('Diagnostic', () => {
  const diagnostic: DiagnosticAssessment = {
    courseId: 'sql-fundamentals',
    title: 'SQL starting point',
    instructions: 'Answer what you know.',
    questions: [
      {
        id: 'sql-dx-where',
        lessonId: 'sql-select-and-filter',
        prompt: 'Which query returns remote jobs?',
        code: null,
        options: [
          { id: 'a', text: 'WHERE remote' },
          { id: 'b', text: 'ORDER BY remote' },
        ],
      },
      {
        id: 'sql-dx-join',
        lessonId: 'sql-joins',
        prompt: 'Which join keeps every job?',
        code: null,
        options: [
          { id: 'a', text: 'INNER' },
          { id: 'b', text: 'LEFT' },
        ],
      },
    ],
  };
  const result: DiagnosticResult = {
    attemptId: 'att',
    courseId: 'sql-fundamentals',
    score: 1,
    maxScore: 2,
    completedAt: '2026-10-17T10:00:00.000Z',
    topics: [
      {
        lessonId: 'sql-select-and-filter',
        lessonTitle: 'SELECT, WHERE and ORDER BY',
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
        questionId: 'sql-dx-where',
        answered: true,
        correct: true,
        correctOptionId: 'a',
        explanation: 'WHERE filters.',
      },
      {
        questionId: 'sql-dx-join',
        answered: false,
        correct: false,
        correctOptionId: 'b',
        explanation: 'LEFT keeps all rows.',
      },
    ],
    skills: [{ skillId: 'sql', name: 'SQL', correct: 1, total: 2 }],
  };

  it('lets the learner skip questions and shows a plan, not a grade', async () => {
    const url = '/learning/courses/sql-fundamentals/diagnostic/attempts';
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/courses/sql-fundamentals/diagnostic': { body: diagnostic },
      [`POST ${url}`]: { status: 201, body: result },
    });
    const user = userEvent.setup();
    renderApp('/learn/courses/sql-fundamentals/diagnostic');
    const first = await screen.findByRole('group', { name: /Question 1 of 2/ });
    await user.click(within(first).getByRole('radio', { name: 'WHERE remote' }));
    expect(screen.getByText(/1 of 2 answered/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See my results' }));

    expect(
      await screen.findByRole('heading', { name: 'You answered 1 of 2 correctly' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not a grade/)).toBeInTheDocument();
    const plan = within(screen.getByRole('list', { name: 'Suggested plan' }));
    expect(plan.getByText('Skim')).toBeInTheDocument();
    expect(plan.getByText('Study')).toBeInTheDocument();
    expect(screen.getByText('LEFT')).toBeInTheDocument();
    expect(api.find('POST', url)[0]?.body).toEqual({
      answers: [{ questionId: 'sql-dx-where', optionId: 'a' }],
    });
  });
});

describe('My learning', () => {
  it('shows an empty state with ways to start', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': {
        body: {
          courses: [],
          revision: [],
          nextLesson: null,
          remainingMinutes: 0,
          assessedSkills: [],
          analytics: analytics(),
          readiness: readiness(),
        },
      },
    });
    renderApp('/learn/my-learning');
    expect(
      await screen.findByRole('heading', { name: 'You have not started any courses yet' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get a personalised plan' })).toHaveAttribute(
      'href',
      '/learn/plan',
    );
  });

  it('shows real progress, the next lesson, items to revise and assessed skills', async () => {
    const dashboard: LearningDashboard = {
      analytics: analytics(),
      readiness: readiness({
        nextAction: {
          kind: 'CONTINUE_LESSON',
          title: 'Continue with "SELECT, WHERE and ORDER BY"',
          reason: 'It is the next lesson you have not completed in a course you selected.',
          href: '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter',
        },
      }),
      courses: [
        {
          course: courseSummary(),
          progress: progress({
            enrolled: true,
            completedLessonIds: ['sql-joins'],
            remainingMinutes: 25,
          }),
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
          correct: 4,
          total: 6,
          sufficient: true,
          assessedAt: '2026-10-17T10:00:00.000Z',
        },
      ],
    };
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': { body: dashboard },
      'GET /learning/next-steps': { body: nextSteps(dashboard.readiness.nextAction) },
    });
    renderApp('/learn/my-learning');
    expect(await screen.findByRole('link', { name: /^Start: Continue with/ })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/lessons/sql-select-and-filter',
    );
    expect(screen.getByText(/1 of 2 lessons marked complete/)).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'SQL fundamentals lessons completed' }),
    ).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Which clause decides which rows are kept?')).toBeInTheDocument();
    expect(screen.getByText('From diagnostics only')).toBeInTheDocument();
    expect(screen.getByText(/4\/6/)).toBeInTheDocument();
  });
});
