import {
  smartApplyDisplay,
  type SmartApplicationDetail,
  type SmartApplicationSummary,
  type SmartApplySettingsItem,
  type SmartApplyQuestion,
} from '@job-assist/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../test/api-mock';
import { meOk } from '../../../test/factories';
import { renderApp } from '../../../test/render-app';

const noNotifications = { body: { items: [], unreadCount: 0 } };

const summary = (o: Partial<SmartApplicationSummary> = {}): SmartApplicationSummary => ({
  id: 'sa1',
  applicationId: 'app1',
  state: 'AWAITING_USER_SUBMISSION',
  trackerStatus: 'PREPARING',
  job: {
    id: 'j1',
    title: 'Frontend Developer',
    companyName: 'Acme',
    location: 'Chennai',
    source: 'Greenhouse',
  },
  matchScore: 82,
  outstandingQuestions: 0,
  submissionMethod: 'USER_HANDOFF',
  confirmation: null,
  uncertain: false,
  failureReason: null,
  createdAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-13T09:00:00.000Z',
  ...o,
});

const question = (o: Partial<SmartApplyQuestion> = {}): SmartApplyQuestion => ({
  id: 'q1',
  applicationId: 'app1',
  smartApplicationId: 'sa1',
  question: 'Will you require visa sponsorship?',
  questionType: 'WORK_AUTHORIZATION',
  required: true,
  sensitivity: 'SENSITIVE',
  options: ['Yes', 'No'],
  origin: 'employer’s Greenhouse application form',
  answer: null,
  confirmed: false,
  prefilledFrom: null,
  reason: 'This question is required by the employer’s Greenhouse application form.',
  job: { title: 'Frontend Developer', companyName: 'Acme' },
  ...o,
});

const detail = (o: Partial<SmartApplicationDetail> = {}): SmartApplicationDetail => ({
  ...summary(),
  officialApplicationUrl: 'https://boards.greenhouse.io/acme/jobs/77',
  applicationUrlKind: 'EMPLOYER_POSTING',
  matchExplanation: 'Strong match (82%) with “Angular Resume” v1.',
  resume: { resumeId: 'r1', resumeName: 'Angular Resume', resumeVersionId: 'v1', versionNumber: 1 },
  coverLetter: { versionNumber: 1, status: 'GENERATED', text: 'Dear Hiring Team,' },
  questions: [],
  eligibility: {
    autoSubmitEligible: false,
    method: 'USER_HANDOFF',
    providerKey: null,
    checks: [
      {
        code: 'PROVIDER_INTEGRATION',
        satisfied: false,
        message: 'Greenhouse is used here for discovery only.',
      },
    ],
    summary: 'You submit this application yourself on the official site.',
  },
  confirmationReference: null,
  approvedAt: '2026-10-13T09:00:00.000Z',
  preparedAt: '2026-10-13T09:00:00.000Z',
  submittedAt: null,
  history: [],
  attempts: [],
  ...o,
});

const settings: SmartApplySettingsItem = {
  mode: 'PREPARE_ONLY',
  dailyApplicationLimit: 10,
  dailySubmissionLimit: 3,
  autoSubmitConsentAt: null,
  consentText: 'I allow the app to submit applications I have approved…',
  consentVersion: 'auto-submit@1',
  autoSubmitAvailable: false,
  providers: [],
  usage: { applicationsToday: 1, submissionsToday: 0 },
};

describe('Smart Apply status display', () => {
  it('shows only provider confirmations as success', () => {
    expect(
      smartApplyDisplay({
        state: 'SUBMITTED',
        confirmation: 'PROVIDER_CONFIRMED',
        uncertain: false,
      }),
    ).toMatchObject({ tone: 'success' });
    expect(
      smartApplyDisplay({ state: 'SUBMITTED', confirmation: 'USER_REPORTED', uncertain: false }),
    ).toMatchObject({
      tone: 'neutral',
      label: 'Submitted · reported by you',
    });
    expect(
      smartApplyDisplay({ state: 'SUBMITTING', confirmation: null, uncertain: true }),
    ).toMatchObject({
      kind: 'UNCERTAIN',
      tone: 'danger',
    });
  });
});

describe('Smart Apply pages', () => {
  it('lists applications, distinguishing reported, confirmed and uncertain submissions', async () => {
    mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': noNotifications,
      'GET /smart-apply/questions': { body: [question()] },
      'GET /smart-apply/applications?page=1&pageSize=20': {
        body: {
          items: [
            summary({ id: 'a', state: 'SUBMITTED', confirmation: 'USER_REPORTED' }),
            summary({
              id: 'b',
              state: 'SUBMITTED',
              confirmation: 'PROVIDER_CONFIRMED',
              job: { ...summary().job, title: 'Backend Developer' },
            }),
            summary({
              id: 'c',
              state: 'SUBMITTING',
              uncertain: true,
              job: { ...summary().job, title: 'QA Engineer' },
            }),
            summary({
              id: 'd',
              state: 'NEEDS_USER_INPUT',
              outstandingQuestions: 2,
              job: { ...summary().job, title: 'UI Engineer' },
            }),
          ],
          total: 4,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderApp('/smart-apply');
    const list = await screen.findByRole('list', { name: 'Smart Apply applications' });
    expect(within(list).getByText('Submitted · reported by you')).toBeInTheDocument();
    expect(within(list).getByText('Submitted · confirmed by provider')).toBeInTheDocument();
    expect(within(list).getByText('Submission uncertain')).toBeInTheDocument();
    expect(within(list).getByText(/2 questions to answer/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Questions \(1\)/ })).toHaveAttribute(
      'href',
      '/smart-apply/questions',
    );
  });

  it('hands off to the official site and only marks it submitted after an explicit confirmation', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': noNotifications,
      'GET /smart-apply/applications/sa1': { body: detail() },
      'POST /smart-apply/applications/sa1/manual-submission': {
        body: detail({ state: 'SUBMITTED', confirmation: 'USER_REPORTED' }),
      },
    });
    renderApp('/smart-apply/sa1');
    const link = await screen.findByRole('link', { name: /Open the official application page/ });
    expect(link).toHaveAttribute('href', 'https://boards.greenhouse.io/acme/jobs/77');
    expect(screen.getByText('The employer’s own job posting')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'You submit this application on the official site' }),
    ).toBeInTheDocument();
    const mark = screen.getByRole('button', { name: 'Mark as submitted' });
    expect(mark).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText('I submitted this application myself on the official site'),
    );
    await userEvent.click(mark);
    await waitFor(() =>
      expect(api.find('POST', '/smart-apply/applications/sa1/manual-submission')[0]?.body).toEqual({
        confirm: true,
      }),
    );
  });

  it('requires an explicit confirmation for sensitive answers', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': noNotifications,
      'GET /smart-apply/questions': {
        body: [question({ answer: 'No', prefilledFrom: 'SAVED_ANSWER' })],
      },
      'PUT /smart-apply/applications/sa1/questions/q1/answer': {
        body: question({ answer: 'No', confirmed: true }),
      },
    });
    renderApp('/smart-apply/questions');
    const form = await screen.findByRole('form', { name: 'Will you require visa sponsorship?' });
    expect(within(form).getByText(/Pre-filled from an answer you saved/)).toBeInTheDocument();
    const confirm = within(form).getByRole('button', { name: 'Confirm answer' });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(form).getByLabelText(/I confirm this answer is true/));
    await userEvent.click(within(form).getByLabelText('Save this answer for future applications'));
    await userEvent.click(confirm);
    await waitFor(() =>
      expect(api.find('PUT', '/smart-apply/applications/sa1/questions/q1/answer')[0]?.body).toEqual(
        {
          answer: 'No',
          confirm: true,
          saveForReuse: true,
        },
      ),
    );
  });

  it('explains when no submission integration exists and records consent changes', async () => {
    const api = mockApi({
      'GET /auth/me': meOk,
      'GET /notifications': noNotifications,
      'GET /smart-apply/settings': { body: settings },
      'GET /smart-apply/saved-answers': { body: [] },
      'PUT /smart-apply/settings': { body: { ...settings, mode: 'HYBRID' } },
    });
    renderApp('/smart-apply/settings');
    expect(
      await screen.findByText(/No authorised submission integration is available/),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'HYBRID');
    await userEvent.click(screen.getByLabelText('I agree'));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(api.find('PUT', '/smart-apply/settings')[0]?.body).toEqual({
        mode: 'HYBRID',
        dailyApplicationLimit: 10,
        dailySubmissionLimit: 3,
        autoSubmitConsent: true,
      }),
    );
    expect(screen.getByText('No saved answers.')).toBeInTheDocument();
  });
});
