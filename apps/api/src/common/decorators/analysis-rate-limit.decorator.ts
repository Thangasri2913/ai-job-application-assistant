import { SetMetadata } from '@nestjs/common';

export const ANALYSIS_RATE_LIMIT_KEY = 'rateLimit:analysis';

/**
 * Applies the stricter `analysis` throttler (JOB_ANALYSIS_RATE_LIMIT_MAX per window) in
 * addition to the default one. Use on endpoints that start (possibly AI-backed) analysis.
 */
export const AnalysisRateLimit = () => SetMetadata(ANALYSIS_RATE_LIMIT_KEY, true);
