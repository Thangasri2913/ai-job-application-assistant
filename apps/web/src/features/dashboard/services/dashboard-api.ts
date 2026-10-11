import type { DashboardSummary } from '@job-assist/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../../lib/api/http';
import { dashboardKeys } from '../../career-profile/hooks/useProfile';

export const dashboardApi = {
  summary: () => apiRequest<DashboardSummary>('/dashboard/summary'),
};

export function useDashboardSummary() {
  return useQuery({ queryKey: dashboardKeys.summary, queryFn: dashboardApi.summary });
}
