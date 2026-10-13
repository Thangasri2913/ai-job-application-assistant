import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../services/career-api';

export const careerKeys = {
  report: ['career-intelligence', 'report'] as const,
  insights: ['career-intelligence', 'insights'] as const,
};

export function useCareerReport() {
  return useQuery({ queryKey: careerKeys.report, queryFn: careerApi.report });
}

/** Polls while insights are being generated in the background. */
export function useCareerInsights() {
  return useQuery({
    queryKey: careerKeys.insights,
    queryFn: careerApi.insights,
    refetchInterval: (q) => (q.state.data?.generating ? 2000 : false),
  });
}

export function useRefreshInsights() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: careerApi.refreshInsights,
    onSuccess: (data) => client.setQueryData(careerKeys.insights, data),
  });
}
