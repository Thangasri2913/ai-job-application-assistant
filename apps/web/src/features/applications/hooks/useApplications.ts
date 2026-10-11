import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardKeys } from '../../career-profile/hooks/useProfile';
import { jobKeys } from '../../jobs/hooks/useJobs';
import { type ApplicationListQuery, applicationsApi } from '../services/applications-api';

export const applicationKeys = {
  all: ['applications'] as const,
  list: (q: ApplicationListQuery) =>
    [
      'applications',
      'list',
      q.archived,
      {
        status: q.status ?? '',
        q: q.q?.trim() ?? '',
        from: q.appliedFrom ?? '',
        to: q.appliedTo ?? '',
        sort: q.sort ?? 'updated',
      },
    ] as const,
  detail: (id: string) => ['applications', 'detail', id] as const,
  timeline: (id: string) => ['applications', 'detail', id, 'timeline'] as const,
  notes: (id: string) => ['applications', 'detail', id, 'notes'] as const,
  documents: (id: string) => ['applications', 'detail', id, 'documents'] as const,
};

export function useApplications(query: ApplicationListQuery) {
  return useQuery({
    queryKey: applicationKeys.list(query),
    queryFn: () => applicationsApi.list(query),
    placeholderData: keepPreviousData,
  });
}

export function useApplication(id: string) {
  return useQuery({ queryKey: applicationKeys.detail(id), queryFn: () => applicationsApi.get(id) });
}

export function useApplicationTimeline(id: string) {
  return useQuery({
    queryKey: applicationKeys.timeline(id),
    queryFn: () => applicationsApi.timeline(id),
  });
}

export function useApplicationNotes(id: string) {
  return useQuery({
    queryKey: applicationKeys.notes(id),
    queryFn: () => applicationsApi.notes(id),
  });
}

export function useApplicationDocuments(id: string) {
  return useQuery({
    queryKey: applicationKeys.documents(id),
    queryFn: () => applicationsApi.documents(id),
  });
}

/** Application changes affect applications, jobs (their application badge) and the dashboard. */
export function useInvalidateApplications() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: applicationKeys.all }),
      client.invalidateQueries({ queryKey: jobKeys.all }),
      client.invalidateQueries({ queryKey: dashboardKeys.summary }),
    ]);
}

export function useApplicationAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateApplications();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate() });
}
