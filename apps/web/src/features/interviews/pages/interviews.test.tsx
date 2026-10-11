import type {
  InterviewEvaluationItem,
  InterviewFocusAreas,
  InterviewQuestionItem,
  InterviewReport,
  InterviewSessionDetail,
  InterviewSessionSummary,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const focus: InterviewFocusAreas = {
  applicationId: 'ap1',
  job: { id: 'j1', title: 'Frontend Developer', companyName: 'ABC Technologies' },
  resume: { resumeId: 'r1', resumeName: 'Angular Resume', resumeVersionId: 'v3', versionNumber: 3 },
  match: { score: 86, level: 'EXCELLENT' },
  strengths: ['Angular', 'TypeScript', 'REST APIs'],
  gaps: ['AWS'],
  responsibilities: ['Build dashboards in Angular'],
  aiEnabled: false,
};

const question = (o: Partial<InterviewQuestionItem> = {}): InterviewQuestionItem => ({
  id: 'q1',
  order: 1,
  question: 'How would you improve the performance of a large Angular application?',
  category: 'TECHNICAL',
  difficulty: 'MEDIUM',
  expectedTopics: ['Angular', 'OnPush'],
  rationale: 'The job requires Angular; your resume shows it in your work experience.',
  source: 'RULES',
  answers: [],
  ...o,
});

const evaluation: InterviewEvaluationItem = {
  id: 'e1',
  source: 'RULES',
  overallScore: 8,
  dimensions: {
    relevance: 9,
    clarity: 8,
    technicalAccuracy: null,
    structure: 7,
    specificity: 8,
    communication: 8,
    completeness: 7,
  },
  strengths: ['Covers the expected topics: Angular, OnPush'],
  improvements: [
    'Explain the observable result of your action, if you have a genuine result to share.',
  ],
  star: { situation: 'PRESENT', task: 'PRESENT', action: 'STRONG', result: 'MISSING' },
  technical: null,
  feedback: null,
  note: 'AI is not configured on this server: these are rule-based practice checks.',
  createdAt: '2026-10-11T10:00:00.000Z',
};

const session = (o: Partial<InterviewSessionDetail> = {}): InterviewSessionDetail => ({
  id: 's1',
  applicationId: 'ap1',
  type: 'TECHNICAL',
  focus: 'TECHNICAL',
  difficulty: 'MEDIUM',
  questionCount: 2,
  status: 'IN_PROGRESS',
  job: focus.job,
  resume: focus.resume,
  overallScore: null,
  startedAt: '2026-10-11T09:00:00.000Z',
  completedAt: null,
  createdAt: '2026-10-11T09:00:00.000Z',
  updatedAt: '2026-10-11T09:00:00.000Z',
  isMock: false,
  currentIndex: 0,
  questions: [
    question(),
    question({
      id: 'q2',
      order: 2,
      question: 'Tell me about a time you disagreed with a teammate.',
      category: 'BEHAVIORAL',
      expectedTopics: [],
    }),
  ],
  questionsSource: 'RULES',
  questionsNote: null,
  busyOperation: null,
  aiEnabled: false,
  hasReport: false,
  ...o,
});

const report: InterviewReport = {
  sessionId: 's1',
  overallScore: 82,
  label: 'Rule-based practice feedback',
  source: 'RULES',
  answered: 2,
  total: 2,
  strengths: ['Clear, readable sentences'],
  improvements: ['Give more structured behavioral answers.'],
  categories: [{ topic: 'Technical', score: 88, questions: 1 }],
  topics: [{ topic: 'Angular', score: 88, questions: 1 }],
  summary: null,
  generatedAt: '2026-10-11T10:00:00.000Z',
};

describe('Interview preparation', () => {
  it('shows the interview focus from the job and resume', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /applications/ap1/interview-focus': { body: focus },
      'GET /applications/ap1/interviews': { body: [] },
    });
    renderApp('/applications/ap1/interviews');
    expect(await screen.findByText('Angular Resume v3')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Strengths to discuss' })).getByText('REST APIs'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Gaps' })).getByText('AWS')).toBeInTheDocument();
    expect(screen.getByText(/Prepare honest answers/)).toBeInTheDocument();
  });

  it('starts a mock interview with the chosen settings (defaults: mixed, medium, 10)', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /applications/ap1/interview-focus': { body: focus },
      'GET /applications/ap1/interviews': { body: [] },
      'POST /applications/ap1/interviews': {
        status: 201,
        body: session({ id: 's9', status: 'CREATED', questions: [] }),
      },
      'POST /interviews/s9/questions/generate': { body: session({ id: 's9', status: 'CREATED' }) },
      'POST /interviews/s9/start': {
        body: session({ id: 's9', type: 'MOCK_INTERVIEW', isMock: true }),
      },
      'GET /interviews/s9': { body: session({ id: 's9', type: 'MOCK_INTERVIEW', isMock: true }) },
    });
    const { router } = renderApp('/applications/ap1/interviews');
    expect(await screen.findByLabelText('Interview type')).toHaveValue('MIXED');
    expect(screen.getByLabelText('Difficulty')).toHaveValue('MEDIUM');
    expect(screen.getByLabelText('Number of questions')).toHaveValue('10');
    await userEvent.selectOptions(screen.getByLabelText('Number of questions'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Start mock interview' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/interviews/s9'));
    expect(api.find('POST', '/applications/ap1/interviews')[0]!.body).toEqual({
      type: 'MOCK_INTERVIEW',
      focus: 'MIXED',
      difficulty: 'MEDIUM',
      questionCount: 5,
    });
    expect(api.find('POST', '/interviews/s9/questions/generate')).toHaveLength(1);
  });
});

describe('Interview session', () => {
  it('practice: submits the answer, then shows separate feedback', async () => {
    const answered = session({
      questions: [
        question({
          answers: [
            {
              id: 'a1',
              attempt: 1,
              answer: 'I use OnPush change detection.',
              createdAt: '2026-10-11T10:00:00.000Z',
              evaluation,
            },
          ],
        }),
        session().questions[1]!,
      ],
    });
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /interviews/s1': { body: session() },
      'POST /interviews/s1/questions/q1/answer': { body: session() },
      'POST /interviews/s1/questions/q1/evaluate': { body: answered },
    });
    renderApp('/interviews/s1');
    expect(await screen.findByText('Question 1 of 2 · 0 answered')).toBeInTheDocument();
    expect(screen.getByText(/Why this question: The job requires Angular/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your answer'), 'I use OnPush change detection.');
    await userEvent.click(screen.getByRole('button', { name: 'Evaluate answer' }));
    await waitFor(() =>
      expect(api.find('POST', '/interviews/s1/questions/q1/evaluate')).toHaveLength(1),
    );
    expect(api.find('POST', '/interviews/s1/questions/q1/answer')[0]!.body).toEqual({
      answer: 'I use OnPush change detection.',
    });

    const feedback = await screen.findByLabelText('Answer feedback');
    expect(within(feedback).getByText('Score: 8/10')).toBeInTheDocument();
    expect(within(feedback).getByText('Rule-based practice feedback')).toBeInTheDocument();
    expect(
      within(within(feedback).getByRole('list', { name: 'STAR structure' })).getByText(
        'Result: Missing',
      ),
    ).toBeInTheDocument();
    expect(within(feedback).getByText(/if you have a genuine result to share/)).toBeInTheDocument();
    expect(screen.getByText('I use OnPush change detection.')).toBeInTheDocument(); // the answer, unchanged
    expect(screen.getByLabelText('Try again')).toBeInTheDocument();
  });

  it('mock: one question at a time, no feedback until the end', async () => {
    const mock = session({
      type: 'MOCK_INTERVIEW',
      isMock: true,
      questions: session().questions.map((q) => ({ ...q, expectedTopics: [], rationale: null })),
    });
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /interviews/s1': { body: mock },
      'POST /interviews/s1/questions/q1/answer': { body: { ...mock, currentIndex: 1 } },
    });
    renderApp('/interviews/s1');
    expect(await screen.findByText('Question 1 / 2')).toBeInTheDocument();
    expect(
      screen.queryByText('Tell me about a time you disagreed with a teammate.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Why this question/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Answer'), 'My answer');
    await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(await screen.findByText('Question 2 / 2')).toBeInTheDocument();
    expect(
      screen.getByText('Tell me about a time you disagreed with a teammate.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Answer feedback')).not.toBeInTheDocument();
    expect(api.find('POST', '/interviews/s1/questions/q1/answer')[0]!.body).toEqual({
      answer: 'My answer',
    });
  });

  it('completed: shows the report labelled as practice feedback, read-only', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /interviews/s1': {
        body: session({
          status: 'COMPLETED',
          overallScore: 82,
          hasReport: true,
          completedAt: '2026-10-11T10:00:00.000Z',
        }),
      },
      'GET /interviews/s1/report': { body: report },
    });
    renderApp('/interviews/s1');
    expect(await screen.findByLabelText('82 out of 100')).toBeInTheDocument();
    expect(screen.getByText('Rule-based practice feedback')).toBeInTheDocument();
    expect(screen.getByText(/not scientific measurements or a prediction/)).toBeInTheDocument();
    expect(screen.getByText('Give more structured behavioral answers.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Completed — this session is read-only')).toBeInTheDocument();
  });
});

describe('Interview history', () => {
  it('lists previous sessions with type, date and score', async () => {
    const summary: InterviewSessionSummary = {
      ...session({ type: 'MOCK_INTERVIEW', status: 'COMPLETED', overallScore: 82 }),
    };
    mockApi({ 'GET /auth/me': meOk, 'GET /interviews': { body: [summary] } });
    renderApp('/interviews');
    const list = await screen.findByRole('list', { name: 'Interview sessions' });
    expect(
      within(list).getByRole('link', { name: 'Frontend Developer · ABC Technologies' }),
    ).toHaveAttribute('href', '/interviews/s1');
    expect(within(list).getByText(/Mock interview ·/)).toBeInTheDocument();
    expect(within(list).getByText('82/100')).toBeInTheDocument();
  });
});
