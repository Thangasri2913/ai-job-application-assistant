import type { JobDetail } from '@job-assist/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { ApiError, OFFLINE_MESSAGE } from '../src/api/client';
import { ApplicationScreen } from '../src/screens/ApplicationScreen';
import { ApplicationsScreen } from '../src/screens/ApplicationsScreen';
import { JobScreen } from '../src/screens/JobScreen';
import { JobsScreen } from '../src/screens/JobsScreen';
import { QuestionsScreen } from '../src/screens/QuestionsScreen';
import { question, recommendation, renderScreen, smartDetail } from './helpers';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
  maybeCompleteAuthSession: jest.fn(),
}));

const job = (o: Partial<JobDetail> = {}) =>
  ({
    id: 'j1',
    title: recommendation().job.title,
    companyName: 'Acme Analytics',
    location: 'Bengaluru, India',
    employmentType: 'FULL_TIME',
    source: 'Greenhouse',
    jobUrl: 'https://boards.greenhouse.io/acme/jobs/77',
    status: 'ACTIVE',
    origin: 'DISCOVERED',
    isSampleData: false,
    inLibrary: false,
    description: 'Build Angular dashboards. '.repeat(40),
    application: null,
    ...o,
  }) as unknown as JobDetail;

describe('jobs', () => {
  it('shows an honest empty state, and a clear-filters action when filtered', async () => {
    const recommendations = jest.fn(() => Promise.resolve([]));
    renderScreen({ recommendations }, <JobsScreen />);
    expect(await screen.findByText('No job matches yet')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: 'Minimum match: 80%+' }));
    expect(await screen.findByText('No jobs match these filters')).toBeTruthy();
    expect(recommendations).toHaveBeenLastCalledWith({ status: 'ACTIVE', minScore: 80 });
    fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(recommendations).toHaveBeenLastCalledWith({ status: 'ACTIVE' }));
  });

  it('recovers from a network failure with Try again', async () => {
    const recommendations = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(OFFLINE_MESSAGE, 'offline'))
      .mockResolvedValueOnce([recommendation()]);
    renderScreen({ recommendations }, <JobsScreen />);
    expect(await screen.findByText(OFFLINE_MESSAGE)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(recommendation().job.title)).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('shows a job with its match explanation, skills and gaps, and never implies applying', async () => {
    renderScreen(
      {
        job: jest.fn(() => Promise.resolve(job())),
        recommendation: jest.fn(() => Promise.resolve(recommendation())),
      },
      <JobScreen jobId="j1" recommendationId="jr1" />,
    );
    expect(await screen.findByText('Why it was recommended')).toBeTruthy();
    expect(screen.getByText(recommendation().reason)).toBeTruthy();
    expect(screen.getByText('✓ Angular')).toBeTruthy();
    expect(screen.getByText('✗ RxJS')).toBeTruthy();
    expect(screen.getByText('82% · Strong match')).toBeTruthy();
    // Opening the posting asks first and says it doesn't apply.
    fireEvent.press(screen.getByRole('button', { name: 'View posting on boards.greenhouse.io' }));
    expect(await screen.findByText(/Viewing a posting doesn’t apply to the job/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Open posting' }));
    await waitFor(() =>
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
        'https://boards.greenhouse.io/acme/jobs/77',
      ),
    );
    // Long descriptions are previewed.
    expect(screen.getByRole('button', { name: 'Show full description' })).toBeTruthy();
  });

  it('shows no explanation when the job has no recommendation (nothing invented)', async () => {
    renderScreen({ job: jest.fn(() => Promise.resolve(job())) }, <JobScreen jobId="j1" />);
    expect(await screen.findByText('Job description')).toBeTruthy();
    expect(screen.queryByText('Why it was recommended')).toBeNull();
    expect(screen.queryByText(/% · /)).toBeNull();
  });
});

describe('applications', () => {
  it('lists Smart Apply and tracked applications once each, with what they need next', async () => {
    renderScreen(
      {
        applications: jest.fn(() =>
          Promise.resolve({
            items: [
              { ...smartDetail(), state: 'NEEDS_USER_INPUT' as const, outstandingQuestions: 2 },
              {
                ...smartDetail(),
                id: 'sa2',
                applicationId: 'app2',
                state: 'SUBMITTED' as const,
                confirmation: 'USER_REPORTED' as const,
                job: { ...smartDetail().job, title: 'QA Engineer' },
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
        ),
        trackedApplications: jest.fn(() =>
          Promise.resolve([
            {
              id: 'app1',
              jobId: 'j1',
              jobTitle: 'Frontend Developer',
              companyName: 'Acme',
              status: 'PREPARING' as const,
              resume: { resumeId: 'r1', resumeName: 'R', resumeVersionId: 'v1', versionNumber: 1 },
              source: null,
              appliedAt: null,
              archivedAt: null,
              createdAt: '2026-10-01T00:00:00Z',
              updatedAt: '2026-10-01T00:00:00Z',
            },
            {
              id: 'app9',
              jobId: 'j9',
              jobTitle: 'Data Analyst',
              companyName: 'Beta',
              status: 'INTERVIEW' as const,
              resume: { resumeId: 'r1', resumeName: 'R', resumeVersionId: 'v1', versionNumber: 1 },
              source: null,
              appliedAt: '2026-10-02',
              archivedAt: null,
              createdAt: '2026-10-01T00:00:00Z',
              updatedAt: '2026-10-01T00:00:00Z',
            },
          ]),
        ),
      },
      <ApplicationsScreen />,
    );
    expect(await screen.findByText('2 required questions to answer')).toBeTruthy();
    expect(screen.getByText('Submitted · reported by you')).toBeTruthy();
    expect(screen.getByText('Interview')).toBeTruthy();
    expect(screen.getAllByText('Frontend Developer')).toHaveLength(1); // not listed twice
  });

  it('explains the handoff and records a submission only after explicit confirmation', async () => {
    const reportSubmitted = jest.fn(() =>
      Promise.resolve(smartDetail({ state: 'SUBMITTED', confirmation: 'USER_REPORTED' })),
    );
    renderScreen(
      { application: jest.fn(() => Promise.resolve(smartDetail())), reportSubmitted },
      <ApplicationScreen id="sa1" />,
    );
    expect(await screen.findByText('Submit on the official site')).toBeTruthy();
    expect(screen.getByLabelText(/Step 4 of 5: Submit/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Open boards.greenhouse.io' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://boards.greenhouse.io/acme/jobs/77',
    );
    expect(screen.getByRole('button', { name: 'Mark as submitted' })).toBeDisabled();
    fireEvent.press(
      screen.getByRole('checkbox', {
        name: 'I submitted this application myself on the official site',
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Mark as submitted' }));
    expect(await screen.findByText(/JobAssist can’t verify it with the employer/)).toBeTruthy();
    expect(reportSubmitted).not.toHaveBeenCalled();
    const dialogButtons = screen.getAllByRole('button', { name: 'Mark as submitted' });
    fireEvent.press(dialogButtons[dialogButtons.length - 1]!);
    await waitFor(() => expect(reportSubmitted).toHaveBeenCalledWith('sa1', { confirm: true }));
  });

  it('separates review from submission: approving asks first and never claims it was sent', async () => {
    const approve = jest.fn(() => Promise.resolve(smartDetail()));
    renderScreen(
      {
        application: jest.fn(() =>
          Promise.resolve(smartDetail({ state: 'READY_FOR_REVIEW', approvedAt: null })),
        ),
        approve,
      },
      <ApplicationScreen id="sa1" />,
    );
    fireEvent.press(await screen.findByRole('button', { name: 'Approve application' }));
    expect(await screen.findByText(/Nothing is submitted yet/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('sa1'));
    expect(await screen.findByText('Application approved.')).toBeTruthy();
    expect(screen.queryByText(/submitted successfully/i)).toBeNull();
  });
});

describe('questions', () => {
  it('requires an explicit confirmation for a sensitive answer, then saves it', async () => {
    const answer = jest.fn(() => Promise.resolve(question({ answer: 'No', confirmed: true })));
    renderScreen(
      { questions: jest.fn(() => Promise.resolve([question()])), answer },
      <QuestionsScreen />,
    );
    fireEvent.press(await screen.findByRole('radio', { name: 'No' }));
    fireEvent.press(screen.getByRole('button', { name: 'Confirm answer' }));
    expect(
      await screen.findByText('Confirm the answer is accurate for this application.'),
    ).toBeTruthy();
    expect(answer).not.toHaveBeenCalled();
    fireEvent.press(
      screen.getByRole('checkbox', {
        name: 'I confirm this answer is true and accurate for this application',
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Confirm answer' }));
    await waitFor(() =>
      expect(answer).toHaveBeenCalledWith('sa1', 'q1', {
        answer: 'No',
        confirm: true,
        saveForReuse: false,
      }),
    );
  });

  it('keeps what you typed when saving fails', async () => {
    const answer = jest.fn(() =>
      Promise.reject(new ApiError('Answers can’t be changed right now.', 'http', 409)),
    );
    renderScreen(
      {
        questions: jest.fn(() =>
          Promise.resolve([
            question({
              question: 'How did you hear about us?',
              questionType: 'OTHER',
              sensitivity: 'STANDARD',
              options: [],
            }),
          ]),
        ),
        answer,
      },
      <QuestionsScreen />,
    );
    fireEvent.changeText(await screen.findByLabelText('Your answer'), 'Company website');
    fireEvent.press(screen.getByRole('button', { name: 'Confirm answer' }));
    expect(await screen.findByText(/Your answer is still here/)).toBeTruthy();
    expect(screen.getByLabelText('Your answer').props.value).toBe('Company website');
  });

  it('never offers to save demographic answers', async () => {
    renderScreen(
      {
        questions: jest.fn(() =>
          Promise.resolve([
            question({
              question: 'What is your gender?',
              questionType: 'OTHER',
              sensitivity: 'DEMOGRAPHIC',
              required: false,
              options: [],
            }),
          ]),
        ),
      },
      <QuestionsScreen />,
    );
    expect(
      await screen.findByText(
        'Demographic answers are used only for this application and never saved.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('checkbox', { name: 'Save this answer for future applications' }),
    ).toBeNull();
  });
});
