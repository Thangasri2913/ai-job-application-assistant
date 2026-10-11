import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobAnalysisStatus, JobDetail } from '@job-assist/shared';
import { dashboardKeys } from '../../career-profile/hooks/useProfile';
import { type JobListQuery, jobsApi } from '../services/jobs-api';

export const jobKeys = {
  all: ['jobs'] as const,
  list: (query: JobListQuery) =>
    [
      'jobs',
      'list',
      query.status,
      { q: query.q?.trim() ?? '', sort: query.sort ?? 'created' },
    ] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  // Keyed by the analysis shown, so results refresh by themselves when a new run completes.
  analysis: (id: string, analysisId: string) =>
    ['jobs', 'detail', id, 'analysis', analysisId] as const,
  matches: (id: string, analysisId: string) =>
    ['jobs', 'detail', id, 'matches', analysisId] as const,
  recommendation: (id: string, analysisId: string) =>
    ['jobs', 'detail', id, 'recommendation', analysisId] as const,
};

export const isAnalysing = (status: JobAnalysisStatus | null | undefined) =>
  status === 'PENDING' || status === 'RUNNING';

export function useJobs(query: JobListQuery) {
  return useQuery({
    queryKey: jobKeys.list(query),
    queryFn: () => jobsApi.list(query),
    placeholderData: keepPreviousData,
    // Keep list badges current while any job is being analysed.
    refetchInterval: (q) =>
      q.state.data?.some((j) => isAnalysing(j.analysisStatus)) ? 2000 : false,
  });
}

export function useJob(jobId: string) {
  return useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: () => jobsApi.get(jobId),
    refetchInterval: (q) => (isAnalysing(q.state.data?.latestAnalysis?.status) ? 1500 : false),
  });
}

export function useJobAnalysis(job: JobDetail | undefined) {
  const analysisId = job?.currentAnalysisId ?? '';
  return useQuery({
    queryKey: jobKeys.analysis(job?.id ?? '', analysisId),
    queryFn: () => jobsApi.analysis(job!.id),
    enabled: Boolean(job && analysisId),
  });
}

export function useJobMatches(job: JobDetail | undefined) {
  const analysisId = job?.currentAnalysisId ?? '';
  return useQuery({
    queryKey: jobKeys.matches(job?.id ?? '', analysisId),
    queryFn: () => jobsApi.matches(job!.id),
    enabled: Boolean(job && analysisId),
  });
}

export function useJobRecommendation(job: JobDetail | undefined) {
  const analysisId = job?.currentAnalysisId ?? '';
  return useQuery({
    queryKey: jobKeys.recommendation(job?.id ?? '', analysisId),
    queryFn: () => jobsApi.recommendation(job!.id),
    enabled: Boolean(job && analysisId),
  });
}

/** Job changes affect lists, the detail and the dashboard. */
export function useInvalidateJobs() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: jobKeys.all }),
      client.invalidateQueries({ queryKey: dashboardKeys.summary }),
    ]);
}

export function useJobAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateJobs();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}
