import type {
  CreateInterviewRequest,
  InterviewFocusAreas,
  InterviewReport,
  InterviewSessionDetail,
  InterviewSessionSummary,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

const s = (id: string) => `/interviews/${id}`;

export const interviewsApi = {
  focus: (applicationId: string) =>
    apiRequest<InterviewFocusAreas>(`/applications/${applicationId}/interview-focus`),
  forApplication: (applicationId: string) =>
    apiRequest<InterviewSessionSummary[]>(`/applications/${applicationId}/interviews`),
  history: () => apiRequest<InterviewSessionSummary[]>('/interviews'),
  create: (applicationId: string, body: CreateInterviewRequest) =>
    apiRequest<InterviewSessionDetail>(`/applications/${applicationId}/interviews`, {
      method: 'POST',
      body,
    }),
  get: (id: string) => apiRequest<InterviewSessionDetail>(s(id)),
  generate: (id: string) =>
    apiRequest<InterviewSessionDetail>(`${s(id)}/questions/generate`, { method: 'POST' }),
  start: (id: string) => apiRequest<InterviewSessionDetail>(`${s(id)}/start`, { method: 'POST' }),
  answer: (id: string, questionId: string, answer: string) =>
    apiRequest<InterviewSessionDetail>(`${s(id)}/questions/${questionId}/answer`, {
      method: 'POST',
      body: { answer },
    }),
  evaluate: (id: string, questionId: string) =>
    apiRequest<InterviewSessionDetail>(`${s(id)}/questions/${questionId}/evaluate`, {
      method: 'POST',
    }),
  complete: (id: string) => apiRequest<InterviewReport>(`${s(id)}/complete`, { method: 'POST' }),
  abandon: (id: string) =>
    apiRequest<InterviewSessionDetail>(`${s(id)}/abandon`, { method: 'POST' }),
  report: (id: string) => apiRequest<InterviewReport>(`${s(id)}/report`),
};
