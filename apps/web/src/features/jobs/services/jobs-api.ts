import type {
  CreateJobRequest,
  JobAnalysisResult,
  JobAnalysisStatus,
  JobDetail,
  JobMatchesResponse,
  JobRecommendationResponse,
  JobSort,
  JobSummary,
  UpdateJobRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

export type JobListFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';

export interface JobListQuery {
  status: JobListFilter;
  q?: string;
  sort?: JobSort;
}

function listParams({ status, q, sort }: JobListQuery): string {
  const params = new URLSearchParams({ status });
  if (q?.trim()) params.set('q', q.trim());
  if (sort && sort !== 'created') params.set('sort', sort);
  return params.toString();
}

const base = (jobId: string) => `/jobs/${jobId}`;

export const jobsApi = {
  list: (query: JobListQuery = { status: 'ACTIVE' }) =>
    apiRequest<JobSummary[]>(`/jobs?${listParams(query)}`),
  get: (jobId: string) => apiRequest<JobDetail>(base(jobId)),
  create: (body: CreateJobRequest) => apiRequest<JobDetail>('/jobs', { method: 'POST', body }),
  update: (jobId: string, body: UpdateJobRequest) =>
    apiRequest<JobDetail>(base(jobId), { method: 'PATCH', body }),
  remove: (jobId: string) => apiRequest<void>(base(jobId), { method: 'DELETE' }),
  archive: (jobId: string) => apiRequest<JobDetail>(`${base(jobId)}/archive`, { method: 'POST' }),
  restore: (jobId: string) => apiRequest<JobDetail>(`${base(jobId)}/restore`, { method: 'POST' }),
  analyze: (jobId: string) =>
    apiRequest<{ analysisId: string; status: JobAnalysisStatus; createdAt: string }>(
      `${base(jobId)}/analyze`,
      { method: 'POST' },
    ),
  analysis: (jobId: string) => apiRequest<JobAnalysisResult>(`${base(jobId)}/analysis`),
  matches: (jobId: string) => apiRequest<JobMatchesResponse>(`${base(jobId)}/matches`),
  recommendation: (jobId: string) =>
    apiRequest<JobRecommendationResponse>(`${base(jobId)}/recommendation`),
  selectResume: (jobId: string, resumeVersionId: string) =>
    apiRequest<JobDetail>(`${base(jobId)}/selected-resume`, {
      method: 'PUT',
      body: { resumeVersionId },
    }),
  clearSelection: (jobId: string) =>
    apiRequest<JobDetail>(`${base(jobId)}/selected-resume`, { method: 'DELETE' }),
};
