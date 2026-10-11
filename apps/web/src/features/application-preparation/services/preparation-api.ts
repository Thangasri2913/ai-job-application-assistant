import type {
  ApplicationPreparationDetail,
  ApplicationQuestionItem,
  CoverLetterResponse,
  CreateQuestionRequest,
  ResumeSuggestionItem,
  ResumeSuggestionsResponse,
  SuggestionDecisionRequest,
  TailoredResumeDraft,
  UpdateQuestionRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

const app = (id: string) => `/applications/${id}`;
const prep = (id: string) => `${app(id)}/preparation`;

export const preparationApi = {
  /** Idempotent: creates the preparation on first use. */
  start: (id: string) => apiRequest<ApplicationPreparationDetail>(prep(id), { method: 'POST' }),
  approve: (id: string) =>
    apiRequest<ApplicationPreparationDetail>(`${prep(id)}/approve`, { method: 'POST' }),
  suggestions: (id: string) =>
    apiRequest<ResumeSuggestionsResponse>(`${prep(id)}/resume-suggestions`),
  generateSuggestions: (id: string) =>
    apiRequest<ResumeSuggestionsResponse>(`${prep(id)}/resume-suggestions`, { method: 'POST' }),
  decide: (id: string, suggestionId: string, body: SuggestionDecisionRequest) =>
    apiRequest<ResumeSuggestionItem>(`${prep(id)}/resume-suggestions/${suggestionId}`, {
      method: 'PATCH',
      body,
    }),
  tailored: (id: string) => apiRequest<TailoredResumeDraft>(`${prep(id)}/tailored-resume`),
  coverLetter: (id: string) => apiRequest<CoverLetterResponse>(`${prep(id)}/cover-letter`),
  generateCoverLetter: (id: string, mode: 'GENERATE' | 'MANUAL' = 'GENERATE') =>
    apiRequest<CoverLetterResponse>(`${prep(id)}/cover-letter`, { method: 'POST', body: { mode } }),
  saveCoverLetter: (id: string, text: string) =>
    apiRequest<CoverLetterResponse>(`${prep(id)}/cover-letter`, {
      method: 'PATCH',
      body: { text },
    }),
  approveCoverLetter: (id: string) =>
    apiRequest<CoverLetterResponse>(`${prep(id)}/cover-letter/approve`, { method: 'POST' }),
  questions: (id: string) => apiRequest<ApplicationQuestionItem[]>(`${app(id)}/questions`),
  addQuestion: (id: string, body: CreateQuestionRequest) =>
    apiRequest<ApplicationQuestionItem>(`${app(id)}/questions`, { method: 'POST', body }),
  generateAnswer: (id: string, questionId: string) =>
    apiRequest<ApplicationQuestionItem>(`${app(id)}/questions/${questionId}/generate`, {
      method: 'POST',
    }),
  updateQuestion: (id: string, questionId: string, body: UpdateQuestionRequest) =>
    apiRequest<ApplicationQuestionItem>(`${app(id)}/questions/${questionId}`, {
      method: 'PATCH',
      body,
    }),
  approveAnswer: (id: string, questionId: string) =>
    apiRequest<ApplicationQuestionItem>(`${app(id)}/questions/${questionId}/approve`, {
      method: 'POST',
    }),
  deleteQuestion: (id: string, questionId: string) =>
    apiRequest<void>(`${app(id)}/questions/${questionId}`, { method: 'DELETE' }),
};
