import type {
  CreateJobAlertRequest,
  JobAlertItem,
  JobRecommendationItem,
  JobRecommendationStatus,
  JobSearchRunItem,
  JobSourceItem,
  NotificationItem,
  NotificationListResponse,
  UpdateJobAlertRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

export type RecommendationFilter = JobRecommendationStatus | 'ACTIVE' | 'ALL';

export const discoveryApi = {
  sources: () => apiRequest<JobSourceItem[]>('/job-sources'),
  alerts: () => apiRequest<JobAlertItem[]>('/job-alerts'),
  alert: (id: string) => apiRequest<JobAlertItem>(`/job-alerts/${id}`),
  createAlert: (body: CreateJobAlertRequest) =>
    apiRequest<JobAlertItem>('/job-alerts', { method: 'POST', body }),
  updateAlert: (id: string, body: UpdateJobAlertRequest) =>
    apiRequest<JobAlertItem>(`/job-alerts/${id}`, { method: 'PATCH', body }),
  deleteAlert: (id: string) => apiRequest<void>(`/job-alerts/${id}`, { method: 'DELETE' }),
  runAlert: (id: string) =>
    apiRequest<JobSearchRunItem>(`/job-alerts/${id}/run`, { method: 'POST' }),
  runs: (id: string) => apiRequest<JobSearchRunItem[]>(`/job-alerts/${id}/runs`),

  recommendations: (status: RecommendationFilter = 'ACTIVE', alertId?: string) => {
    const params = new URLSearchParams({ status });
    if (alertId) params.set('alertId', alertId);
    return apiRequest<JobRecommendationItem[]>(`/recommendations?${params.toString()}`);
  },
  recommendation: (id: string) => apiRequest<JobRecommendationItem>(`/recommendations/${id}`),
  save: (id: string) =>
    apiRequest<JobRecommendationItem>(`/recommendations/${id}/save`, { method: 'POST' }),
  dismiss: (id: string) =>
    apiRequest<JobRecommendationItem>(`/recommendations/${id}/dismiss`, { method: 'POST' }),

  notifications: () => apiRequest<NotificationListResponse>('/notifications'),
  markRead: (id: string) =>
    apiRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    apiRequest<{ updated: number }>('/notifications/read-all', { method: 'PATCH' }),
};
