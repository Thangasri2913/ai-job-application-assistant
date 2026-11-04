import type {
  InterviewFeedback,
  InterviewPracticeQuestion,
  JobReadinessResponse,
  LearningDashboard,
  ProjectChallengeDetail,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';
import { clearDrafts } from '../activity-session';
import { courseSummary, readiness, recommendation, analytics, nextSteps } from '../test/fixtures';

beforeEach(() => clearDrafts());

const question = (
  overrides: Partial<InterviewPracticeQuestion> = {},
): InterviewPracticeQuestion => ({
  id: 'iq-sql-where-having',
  skill: { id: 'sql', name: 'SQL' },
  difficulty: 'BEGINNER',
  prompt: 'What is the difference between WHERE and HAVING in SQL?',
  courseIds: ['sql-fundamentals'],
  conceptCount: 3,
  targetWords: 50,
  attempts: 0,
  lastAttemptAt: null,
  ...overrides,
});

const feedback = (overrides: Partial<InterviewFeedback> = {}): InterviewFeedback => ({
  attemptId: 'a1',
  questionId: 'iq-sql-where-having',
  attemptNumber: 1,
  createdAt: '2026-10-18T10:00:00.000Z',
  answer: 'WHERE filters rows.',
  source: 'RULES',
  dimensions: {
    correctness: { score: 3.3, summary: 'Mentions 1 of 3 key concepts the rubric looks for.' },
    clarity: {
      score: 7,
      summary: 'Mostly clear; shorter sentences and a clearer order would help.',
    },
    completeness: { score: 1.5, summary: 'About 3 words; around 50 is typical for this question.' },
  },
  conceptsCovered: [{ id: 'where-rows', label: 'WHERE filters individual rows before grouping' }],
  missingConcepts: [
    {
      id: 'having-groups',
      label: 'HAVING filters groups after aggregation',
      revise: {
        courseId: 'sql-fundamentals',
        lessonId: 'sql-aggregation',
        lessonTitle: 'GROUP BY and HAVING',
      },
    },
  ],
  strengths: [],
  improvements: ['Consider explaining: having filters groups after aggregation.'],
  exampleAnswer: 'WHERE filters rows before grouping; HAVING filters groups after aggregation.',
  disclaimer:
    'Practice feedback from a keyword-based rubric. It does not predict how a real interview will go.',
  ...overrides,
});

describe('Interview practice', () => {
  it('lists questions and filters them through the API', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/skills': {
        body: {
          skills: [{ id: 'sql', name: 'SQL', category: 'DATA', description: '', courseIds: [] }],
        },
      },
      'GET /learning/courses?status=PUBLISHED': { body: { courses: [courseSummary()] } },
      'GET /learning/interview/questions': {
        body: {
          questions: [
            question(),
            question({
              id: 'iq-js-equality',
              skill: { id: 'javascript', name: 'JavaScript' },
              prompt: 'Explain == and ===.',
            }),
          ],
        },
      },
      'GET /learning/interview/questions?skill=sql': {
        body: { questions: [question({ attempts: 2 })] },
      },
      'GET /learning/interview/questions?skill=sql&difficulty=ADVANCED': {
        body: { questions: [] },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/interview');
    expect(await screen.findByText(/not questions from any employer/)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: '2 questions across 2 skills' }),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Skill' }), 'sql');
    expect(
      await screen.findByRole('link', { name: /Practise again: What is the difference/ }),
    ).toHaveAttribute('href', '/learn/interview/iq-sql-where-having');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Difficulty' }), 'ADVANCED');
    expect(
      await screen.findByRole('heading', { name: 'No practice questions match' }),
    ).toBeInTheDocument();
    expect(
      api.find('GET', '/learning/interview/questions?skill=sql&difficulty=ADVANCED'),
    ).toHaveLength(1);
  });

  it('validates, submits an answer, shows labelled feedback with revision links, and keeps attempts', async () => {
    let attempts: InterviewFeedback[] = [];
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/interview/questions/iq-sql-where-having': () => ({
        body: { question: question({ attempts: attempts.length }), attempts },
      }),
      'POST /learning/interview/questions/iq-sql-where-having/attempts': (call) => {
        const created = feedback({
          answer: (call.body as { answer: string }).answer,
          attemptNumber: attempts.length + 1,
        });
        attempts = [created, ...attempts];
        return { status: 201, body: created };
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/interview/iq-sql-where-having');
    expect(
      await screen.findByRole('heading', { name: /WHERE and HAVING/, level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No attempts yet. Your attempts are saved to your account.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Get feedback' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Write an answer first');
    expect(api.calls.filter((c) => c.method === 'POST')).toEqual([]);

    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'WHERE filters rows.');
    expect(screen.getByText(/3 words · around 50 is typical/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get feedback' }));

    const status = await screen.findByRole('status', { name: '' });
    await waitFor(() => expect(status).toHaveFocus());
    const panel = within(status);
    expect(panel.getByText('Rule-based practice feedback')).toBeInTheDocument();
    expect(
      panel.getByRole('progressbar', { name: 'Key concepts: 3.3 out of 10' }),
    ).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'Revise “GROUP BY and HAVING”' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/lessons/sql-aggregation',
    );
    expect(
      panel.getByText('Show an example answer (one of many valid answers)'),
    ).toBeInTheDocument();
    expect(panel.getByText(/does not predict how a real interview will go/)).toBeInTheDocument();
    expect(
      api.find('POST', '/learning/interview/questions/iq-sql-where-having/attempts')[0]?.body,
    ).toEqual({
      answer: 'WHERE filters rows.',
    });

    // The attempt appears in the history and the box is ready for a retry.
    expect(await screen.findByText(/Attempt 1 ·/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('');
  });

  it('keeps an unsent answer when the learner leaves and returns, and shows API errors', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/interview/questions/iq-sql-where-having': {
        body: { question: question(), attempts: [] },
      },
      'GET /learning/interview/questions': { body: { questions: [question()] } },
      'POST /learning/interview/questions/iq-sql-where-having/attempts': {
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' },
      },
    });
    const user = userEvent.setup();
    const { router } = renderApp('/learn/interview/iq-sql-where-having');
    await user.type(await screen.findByRole('textbox', { name: 'Your answer' }), 'Draft answer');
    await router.navigate('/learn/interview');
    await screen.findByRole('heading', { name: 'Interview practice', level: 1 });
    await router.navigate('/learn/interview/iq-sql-where-having');
    expect(await screen.findByRole('textbox', { name: 'Your answer' })).toHaveValue('Draft answer');

    await user.click(screen.getByRole('button', { name: 'Get feedback' }));
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Draft answer');
  });

  it('shows not found for an unknown question', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/interview/questions/nope': {
        status: 404,
        body: { code: 'NOT_FOUND', message: 'Not found.' },
      },
    });
    renderApp('/learn/interview/nope');
    expect(
      await screen.findByRole('heading', { name: 'Practice question not found' }),
    ).toBeInTheDocument();
  });
});

const challenge = (overrides: Partial<ProjectChallengeDetail> = {}): ProjectChallengeDetail => ({
  id: 'pc-sql-job-search-analytics',
  title: 'Job-search analytics with SQL',
  summary: 'Design a small database.',
  difficulty: 'BEGINNER',
  estimatedHours: 6,
  skills: [{ id: 'sql', name: 'SQL' }],
  courseIds: ['sql-fundamentals'],
  provenance: { origin: 'AI_GENERATED', review: { status: 'UNREVIEWED' } },
  progress: {
    status: 'NOT_STARTED',
    checkedItemIds: [],
    startedAt: null,
    completedAt: null,
    updatedAt: null,
    verification: 'SELF_REPORTED',
  },
  objective: 'Practise modelling.',
  expectedOutcome: 'A repository.',
  prerequisites: ['SQL fundamentals'],
  requirements: ['Tables'],
  acceptanceCriteria: [
    { id: 'schema', text: 'The schema loads' },
    { id: 'queries', text: 'Every question has a query' },
  ],
  steps: ['Sketch the tables'],
  testCases: ['How many applications per status?'],
  selfReview: [{ id: 'readable', text: 'Queries are readable' }],
  extensions: ['Add a view'],
  ...overrides,
});

describe('Project challenges', () => {
  it('records self-reported progress and only allows completion when all criteria are ticked', async () => {
    let current = challenge();
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/projects/pc-sql-job-search-analytics': () => ({ body: current }),
      'PUT /learning/projects/pc-sql-job-search-analytics/progress': (call) => {
        const body = call.body as { status: 'IN_PROGRESS' | 'COMPLETED'; checkedItemIds: string[] };
        current = challenge({
          progress: {
            ...current.progress,
            status: body.status,
            checkedItemIds: body.checkedItemIds,
            updatedAt: '2026-10-18T10:00:00.000Z',
          },
        });
        return { body: current };
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/projects/pc-sql-job-search-analytics');
    expect(await screen.findByText(/not checked or verified by JobAssist/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start this project' }));
    expect(await screen.findByText('Progress saved.')).toBeInTheDocument();

    const complete = screen.getByRole('button', { name: 'Mark project complete' });
    expect(complete).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'The schema loads' }));
    await user.click(screen.getByRole('button', { name: 'Save progress' }));
    await waitFor(() =>
      expect(
        api.find('PUT', '/learning/projects/pc-sql-job-search-analytics/progress').at(-1)?.body,
      ).toEqual({
        status: 'IN_PROGRESS',
        checkedItemIds: ['schema'],
      }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Every question has a query' }));
    expect(screen.getByRole('button', { name: 'Mark project complete' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Mark project complete' }));
    expect(
      await screen.findByText('Saved. Project marked complete (self-reported).'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Completed (self-reported)').length).toBeGreaterThan(0);
  });

  it('shows a save error without losing the ticked items', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/projects/pc-sql-job-search-analytics': {
        body: challenge({ progress: { ...challenge().progress, status: 'IN_PROGRESS' } }),
      },
      'PUT /learning/projects/pc-sql-job-search-analytics/progress': {
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Could not save.' },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/projects/pc-sql-job-search-analytics');
    await user.click(await screen.findByRole('checkbox', { name: 'The schema loads' }));
    await user.click(screen.getByRole('button', { name: 'Save progress' }));
    expect(await screen.findByText('Could not save.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'The schema loads' })).toBeChecked();
  });
});

describe('Job readiness', () => {
  it('explains when there are no analysed jobs and lets the learner continue', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/jobs': { body: { jobs: [] } },
      'GET /resumes?status=ACTIVE': { body: [] },
    });
    renderApp('/learn/jobs');
    expect(
      await screen.findByRole('heading', { name: 'No analysed jobs yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/never invents listings/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Keep learning' })).toHaveAttribute('href', '/learn');
  });

  it('compares a real analysed job and labels each side of the evidence', async () => {
    const base = recommendation().skills[0]!;
    const response: JobReadinessResponse = {
      job: {
        id: 'j1',
        title: 'Data Analyst',
        companyName: 'Acme',
        analysedAt: '2026-10-18T10:00:00.000Z',
        isSampleData: false,
        skillCount: 2,
      },
      resume: null,
      skills: [
        {
          name: 'SQL',
          importance: 'REQUIRED',
          jobSource: 'EXPLICIT',
          skillId: 'sql',
          assessment: { ...base, basis: 'UNKNOWN', resumeEvidence: [], evidenceStrength: 'NONE' },
          courses: [{ id: 'sql-fundamentals', title: 'SQL fundamentals', status: 'PUBLISHED' }],
          lessons: [{ courseId: 'sql-fundamentals', lessonId: 'sql-joins', lessonTitle: 'Joins' }],
          projectChallenges: [
            { id: 'pc-sql-job-search-analytics', title: 'Job-search analytics with SQL' },
          ],
          interviewQuestionCount: 3,
        },
        {
          name: 'Tableau',
          importance: 'PREFERRED',
          jobSource: 'INFERRED',
          skillId: null,
          assessment: null,
          courses: [],
          lessons: [],
          projectChallenges: [],
          interviewQuestionCount: 0,
        },
      ],
      counts: {
        requested: 2,
        measured: 0,
        resumeEvidence: 0,
        userCorrected: 0,
        unknown: 1,
        notCatalogued: 1,
        toPractise: 1,
      },
      limitations: [
        'This is a comparison to guide practice, not a prediction of whether you would get the job.',
      ],
    };
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /learning/jobs': { body: { jobs: [response.job] } },
      'GET /resumes?status=ACTIVE': { body: [] },
      'POST /learning/job-readiness': { body: response },
    });
    const user = userEvent.setup();
    renderApp('/learn/jobs');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Analysed job' }), 'j1');
    await user.click(screen.getByRole('button', { name: 'Compare' }));

    const sql = within(await screen.findByRole('article', { name: 'SQL' }));
    expect(sql.getByText('Required by the job')).toBeInTheDocument();
    expect(sql.getByText('Stated in the posting')).toBeInTheDocument();
    expect(sql.getByText('Unknown')).toBeInTheDocument();
    expect(sql.getByRole('link', { name: 'Joins' })).toHaveAttribute(
      'href',
      '/learn/courses/sql-fundamentals/lessons/sql-joins',
    );
    expect(sql.getByRole('link', { name: '3 interview practice questions' })).toHaveAttribute(
      'href',
      '/learn/interview?skill=sql',
    );
    expect(
      sql.getByRole('link', { name: 'Project: Job-search analytics with SQL' }),
    ).toBeInTheDocument();

    const tableau = within(screen.getByRole('article', { name: 'Tableau' }));
    expect(tableau.getByText('Inferred from the description')).toBeInTheDocument();
    expect(tableau.getByText('Not in the skill catalogue')).toBeInTheDocument();
    expect(screen.getByText(/These are separate counts, not a score/)).toBeInTheDocument();
    expect(
      screen.getByText(/not a prediction of whether you would get the job/),
    ).toBeInTheDocument();
    expect(api.find('POST', '/learning/job-readiness')[0]?.body).toEqual({
      jobId: 'j1',
      corrections: [],
    });
  });

  it('shows errors from the comparison', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/jobs': {
        body: {
          jobs: [
            {
              id: 'j1',
              title: 'Dev',
              companyName: 'Acme',
              analysedAt: null,
              isSampleData: true,
              skillCount: 0,
            },
          ],
        },
      },
      'GET /resumes?status=ACTIVE': { body: [] },
      'POST /learning/job-readiness': {
        status: 409,
        body: { code: 'ANALYSIS_NOT_AVAILABLE', message: 'This job has not been analysed yet.' },
      },
    });
    const user = userEvent.setup();
    renderApp('/learn/jobs');
    expect(
      await screen.findByRole('option', { name: 'Dev — Acme (sample data)' }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Analysed job' }), 'j1');
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByText('This job has not been analysed yet.')).toBeInTheDocument();
  });
});

describe('Readiness on the dashboard', () => {
  it('shows projects, interview practice, skills to practise and the explained next action — without a score', async () => {
    const dashboard: LearningDashboard = {
      courses: [],
      revision: [],
      nextLesson: null,
      remainingMinutes: 0,
      assessedSkills: [],
      analytics: analytics(),
      readiness: readiness({
        projects: [
          {
            challengeId: 'pc-sql-job-search-analytics',
            title: 'Job-search analytics with SQL',
            status: 'IN_PROGRESS',
            checked: 2,
            total: 5,
            updatedAt: null,
          },
        ],
        interview: {
          attempts: 3,
          questionsPractised: 2,
          recent: [
            {
              questionId: 'iq-sql-where-having',
              prompt: 'WHERE vs HAVING?',
              skillName: 'SQL',
              lastAttemptAt: '2026-10-18T10:00:00.000Z',
              correctness: 6.7,
            },
          ],
          conceptsToRevise: [
            {
              label: 'HAVING filters groups after aggregation',
              skillName: 'SQL',
              revise: {
                courseId: 'sql-fundamentals',
                lessonId: 'sql-aggregation',
                lessonTitle: 'GROUP BY and HAVING',
              },
            },
          ],
        },
        skillsToPractise: [
          {
            skillId: 'postgresql',
            name: 'PostgreSQL',
            reason: 'Only 1 diagnostic question answered — too few to measure.',
          },
        ],
        nextAction: {
          kind: 'CONTINUE_PROJECT',
          title: 'Continue "Job-search analytics with SQL"',
          reason: 'You have ticked 2 of 5 acceptance criteria in a project you started.',
          href: '/learn/projects/pc-sql-job-search-analytics',
        },
      }),
    };
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': { body: dashboard },
      'GET /learning/next-steps': { body: nextSteps(dashboard.readiness.nextAction) },
    });
    renderApp('/learn/my-learning');
    expect(await screen.findByText('Continue "Job-search analytics with SQL"')).toBeInTheDocument();
    expect(
      screen.getByText('You have ticked 2 of 5 acceptance criteria in a project you started.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Start: Continue "Job-search analytics with SQL"' }),
    ).toHaveAttribute('href', '/learn/projects/pc-sql-job-search-analytics');
    expect(screen.getByText('2 of 5 acceptance criteria ticked')).toBeInTheDocument();
    expect(screen.getByText('3 attempts on 2 questions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GROUP BY and HAVING' })).toBeInTheDocument();
    expect(
      screen.getByText('Only 1 diagnostic question answered — too few to measure.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No analysed jobs yet, so no job comparisons are shown/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/job-ready|employability|score:/i)).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the dashboard fails', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /learning/dashboard': {
        status: 500,
        body: { code: 'INTERNAL_ERROR', message: 'Down.' },
      },
    });
    renderApp('/learn/my-learning');
    expect(await screen.findByRole('heading', { name: 'Couldn’t load this' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
