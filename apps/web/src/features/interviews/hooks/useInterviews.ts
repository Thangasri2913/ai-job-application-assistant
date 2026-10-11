import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InterviewSessionDetail } from '@job-assist/shared';
import { interviewsApi } from '../services/interviews-api';

export const interviewKeys = {
  all: ['interviews'] as const,
  history: ['interviews', 'history'] as const,
  forApplication: (applicationId: string) => ['interviews', 'application', applicationId] as const,
  focus: (applicationId: string) => ['interviews', 'focus', applicationId] as const,
  session: (id: string) => ['interviews', 'session', id] as const,
  report: (id: string) => ['interviews', 'report', id] as const,
};

export function useInterviewFocus(applicationId: string) {
  return useQuery({
    queryKey: interviewKeys.focus(applicationId),
    queryFn: () => interviewsApi.focus(applicationId),
  });
}
export function useApplicationInterviews(applicationId: string) {
  return useQuery({
    queryKey: interviewKeys.forApplication(applicationId),
    queryFn: () => interviewsApi.forApplication(applicationId),
  });
}
export function useInterviewHistory() {
  return useQuery({ queryKey: interviewKeys.history, queryFn: interviewsApi.history });
}
export function useInterviewSession(id: string) {
  return useQuery({ queryKey: interviewKeys.session(id), queryFn: () => interviewsApi.get(id) });
}
export function useInterviewReport(id: string, enabled: boolean) {
  return useQuery({
    queryKey: interviewKeys.report(id),
    queryFn: () => interviewsApi.report(id),
    enabled,
  });
}

/** Session mutations return the updated session, which is written straight into the cache. */
export function useSessionAction<TArgs>(
  id: string,
  fn: (args: TArgs) => Promise<InterviewSessionDetail>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (session) => {
      client.setQueryData(interviewKeys.session(id), session);
      void client.invalidateQueries({ queryKey: interviewKeys.history });
    },
  });
}

export function useCompleteInterview(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => interviewsApi.complete(id),
    onSuccess: (report) => {
      client.setQueryData(interviewKeys.report(id), report);
      return Promise.all([
        client.invalidateQueries({ queryKey: interviewKeys.session(id) }),
        client.invalidateQueries({ queryKey: interviewKeys.all }),
      ]);
    },
  });
}
