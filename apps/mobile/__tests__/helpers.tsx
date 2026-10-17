import type {
  JobRecommendationItem,
  SmartApplicationDetail,
  SmartApplyQuestion,
} from '@job-assist/shared';
import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ApiClient } from '../src/api/client';
import { AuthTestProvider } from '../src/auth/AuthContext';
import { ConfirmProvider } from '../src/components/ConfirmDialog';
import { NavigationProvider } from '../src/navigation';

export const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 16 },
};

/** Renders a screen with the app's providers and a fake API client. */
export function renderScreen(
  api: Partial<ApiClient>,
  ui: ReactNode,
  extra: { signOut?: () => Promise<void> } = {},
) {
  const value = {
    status: 'signedIn' as const,
    notice: null,
    error: null,
    busy: false,
    signIn: jest.fn(),
    signOut: extra.signOut ?? jest.fn(() => Promise.resolve()),
    api: api as ApiClient,
  };
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ConfirmProvider>
        <AuthTestProvider value={value}>
          <NavigationProvider>{ui}</NavigationProvider>
        </AuthTestProvider>
      </ConfirmProvider>
    </SafeAreaProvider>,
  );
}

export const question = (o: Partial<SmartApplyQuestion> = {}): SmartApplyQuestion => ({
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
  reason: 'Work authorisation is a legal statement.',
  job: { title: 'Frontend Developer', companyName: 'Acme' },
  ...o,
});

export const smartDetail = (o: Partial<SmartApplicationDetail> = {}): SmartApplicationDetail => ({
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
  officialApplicationUrl: 'https://boards.greenhouse.io/acme/jobs/77',
  applicationUrlKind: 'EMPLOYER_POSTING',
  matchExplanation: null,
  resume: { resumeId: 'r1', resumeName: 'Angular Resume', resumeVersionId: 'v1', versionNumber: 1 },
  coverLetter: null,
  questions: [],
  eligibility: {
    autoSubmitEligible: false,
    method: 'USER_HANDOFF',
    providerKey: null,
    checks: [],
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

export const recommendation = (o: Partial<JobRecommendationItem> = {}): JobRecommendationItem => ({
  id: 'jr1',
  status: 'NEW',
  matchScore: 82,
  level: 'STRONG',
  rank: 88,
  reason: 'Strong match (82%) with “Angular Resume” v1. It shows 3 of 3 required skills.',
  reasons: ['“Angular Resume” v1 scored highest of the 2 resumes compared'],
  gaps: ['Docker is mentioned but not required'],
  requiredSkills: { matched: ['Angular', 'TypeScript'], missing: ['RxJS'] },
  resume: { resumeId: 'r1', resumeVersionId: 'v1', resumeName: 'Angular Resume', versionNumber: 1 },
  job: {
    id: 'j1',
    title: 'Senior Frontend Developer with a very long job title for small screens',
    companyName: 'Acme Analytics',
    location: 'Bengaluru, India',
    employmentType: 'FULL_TIME',
    workMode: 'HYBRID',
    jobUrl: 'https://boards.greenhouse.io/acme/jobs/77',
    postedAt: '2026-10-12T09:00:00.000Z',
    isSampleData: false,
  },
  source: {
    key: 'greenhouse',
    name: 'Greenhouse',
    isDevelopment: false,
    attribution: null,
    discoveredFrom: 'Greenhouse job board: acme',
  },
  alert: { id: 'al1', name: 'Frontend' },
  createdAt: '2026-10-13T09:00:05.000Z',
  viewedAt: null,
  savedAt: null,
  dismissedAt: null,
  appliedAt: null,
  ...o,
});
