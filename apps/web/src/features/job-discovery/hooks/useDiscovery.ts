import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobSearchRunItem } from '@job-assist/shared';
import { dashboardKeys } from '../../career-profile/hooks/useProfile';
import { type RecommendationFilter, discoveryApi } from '../services/discovery-api';

export const discoveryKeys = {
  sources: ['job-sources'] as const,
  alerts: ['job-alerts'] as const,
  alert: (id: string) => ['job-alerts', id] as const,
  runs: (id: string) => ['job-alerts', id, 'runs'] as const,
  recommendations: ['recommendations'] as const,
  recommendationList: (status: RecommendationFilter, alertId?: string) =>
    ['recommendations', 'list', status, alertId ?? null] as const,
  recommendation: (id: string) => ['recommendations', 'item', id] as const,
  notifications: ['notifications'] as const,
};

const isRunning = (run: JobSearchRunItem | null | undefined) => run?.status === 'RUNNING';
const POLL_MS = 1500;

export function useJobSources() {
  return useQuery({ queryKey: discoveryKeys.sources, queryFn: discoveryApi.sources });
}

/** Polls while any alert's latest run is still running. */
export function useJobAlerts() {
  return useQuery({
    queryKey: discoveryKeys.alerts,
    queryFn: discoveryApi.alerts,
    refetchInterval: (q) => (q.state.data?.some((a) => isRunning(a.lastRun)) ? POLL_MS : false),
  });
}

export function useJobAlert(id: string) {
  return useQuery({ queryKey: discoveryKeys.alert(id), queryFn: () => discoveryApi.alert(id) });
}

export function useSearchRuns(alertId: string) {
  return useQuery({
    queryKey: discoveryKeys.runs(alertId),
    queryFn: () => discoveryApi.runs(alertId),
    refetchInterval: (q) => (q.state.data?.some(isRunning) ? POLL_MS : false),
  });
}

export function useRecommendations(status: RecommendationFilter, alertId?: string) {
  return useQuery({
    queryKey: discoveryKeys.recommendationList(status, alertId),
    queryFn: () => discoveryApi.recommendations(status, alertId),
  });
}

/** Opening a recommendation marks it viewed on the server. */
export function useRecommendation(id: string | null) {
  return useQuery({
    queryKey: discoveryKeys.recommendation(id ?? ''),
    queryFn: () => discoveryApi.recommendation(id!),
    enabled: id !== null,
  });
}

/** Invalidates everything discovery-related after a change. */
function useInvalidateDiscovery() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: discoveryKeys.alerts });
    void client.invalidateQueries({ queryKey: discoveryKeys.recommendations });
    void client.invalidateQueries({ queryKey: discoveryKeys.notifications });
    void client.invalidateQueries({ queryKey: dashboardKeys.summary });
    void client.invalidateQueries({ queryKey: ['jobs'] });
  };
}

export function useDiscoveryAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const invalidate = useInvalidateDiscovery();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export function useRunAlert() {
  const invalidate = useInvalidateDiscovery();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => discoveryApi.runAlert(alertId),
    onSuccess: (_run, alertId) => {
      invalidate();
      void client.invalidateQueries({ queryKey: discoveryKeys.runs(alertId) });
    },
  });
}

/** Unread count for the bell; refreshed every minute and when a run finishes. */
export function useNotifications() {
  return useQuery({
    queryKey: discoveryKeys.notifications,
    queryFn: discoveryApi.notifications,
    refetchInterval: 60_000,
  });
}

export function useNotificationAction<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void client.invalidateQueries({ queryKey: discoveryKeys.notifications }),
  });
}
