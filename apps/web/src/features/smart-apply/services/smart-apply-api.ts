import type {
  AnswerQuestionRequest,
  ManualSubmissionRequest,
  PrepareSmartApplicationRequest,
  ProfileAnswerItem,
  SmartApplicationDetail,
  SmartApplicationListResponse,
  SmartApplicationMaterials,
  SmartApplySettingsItem,
  SmartApplyQuestion,
  SmartApplyState,
  UpdateSmartApplySettingsRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

export interface SmartApplicationQuery {
  state?: SmartApplyState[];
  sort?: 'updatedAt' | 'createdAt' | 'matchScore';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const base = (id: string) => `/smart-apply/applications/${id}`;

export const smartApplyApi = {
  list: (q: SmartApplicationQuery = {}) => {
    const params = new URLSearchParams();
    if (q.state?.length) params.set('state', q.state.join(','));
    if (q.sort) params.set('sort', q.sort);
    if (q.order) params.set('order', q.order);
    if (q.page) params.set('page', String(q.page));
    if (q.pageSize) params.set('pageSize', String(q.pageSize));
    const query = params.toString();
    return apiRequest<SmartApplicationListResponse>(
      `/smart-apply/applications${query ? `?${query}` : ''}`,
    );
  },
  get: (id: string) => apiRequest<SmartApplicationDetail>(base(id)),
  materials: (id: string) => apiRequest<SmartApplicationMaterials>(`${base(id)}/materials`),
  prepare: (body: PrepareSmartApplicationRequest) =>
    apiRequest<SmartApplicationDetail>('/smart-apply/applications', { method: 'POST', body }),
  answer: (id: string, questionId: string, body: AnswerQuestionRequest) =>
    apiRequest<SmartApplyQuestion>(`${base(id)}/questions/${questionId}/answer`, {
      method: 'PUT',
      body,
    }),
  resume: (id: string) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/resume`, { method: 'POST' }),
  approve: (id: string) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/approve`, { method: 'POST' }),
  handoff: (id: string) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/handoff`, { method: 'POST' }),
  submit: (id: string, idempotencyKey: string) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/submit`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  reportSubmitted: (id: string, body: ManualSubmissionRequest) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/manual-submission`, { method: 'POST', body }),
  cancel: (id: string) =>
    apiRequest<SmartApplicationDetail>(`${base(id)}/cancel`, { method: 'POST' }),
  inbox: () => apiRequest<SmartApplyQuestion[]>('/smart-apply/questions'),
  settings: () => apiRequest<SmartApplySettingsItem>('/smart-apply/settings'),
  updateSettings: (body: UpdateSmartApplySettingsRequest) =>
    apiRequest<SmartApplySettingsItem>('/smart-apply/settings', { method: 'PUT', body }),
  savedAnswers: () => apiRequest<ProfileAnswerItem[]>('/smart-apply/saved-answers'),
  deleteSavedAnswer: (id: string) =>
    apiRequest<void>(`/smart-apply/saved-answers/${id}`, { method: 'DELETE' }),
};
