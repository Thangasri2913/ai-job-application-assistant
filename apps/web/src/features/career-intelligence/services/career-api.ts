import type { CareerInsightsResponse, CareerIntelligenceReport } from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

export const careerApi = {
  report: () => apiRequest<CareerIntelligenceReport>('/career-intelligence/overview'),
  insights: () => apiRequest<CareerInsightsResponse>('/career-intelligence/insights'),
  refreshInsights: () =>
    apiRequest<CareerInsightsResponse>('/career-intelligence/insights/refresh', { method: 'POST' }),
};
