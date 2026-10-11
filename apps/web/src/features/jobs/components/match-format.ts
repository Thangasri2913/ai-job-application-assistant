import type { MatchLevel, SkillMatchStatus } from '@job-assist/shared';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

export const LEVEL_TONE: Record<MatchLevel, Tone> = {
  EXCELLENT: 'success',
  STRONG: 'primary',
  MODERATE: 'warning',
  LOW: 'danger',
};

export const STATUS_DISPLAY: Record<
  SkillMatchStatus,
  { symbol: string; label: string; className: string }
> = {
  MATCH: { symbol: '✓', label: 'Matched', className: 'text-success' },
  PARTIAL: { symbol: '△', label: 'Partial', className: 'text-warning' },
  MISSING: { symbol: '✗', label: 'Missing', className: 'text-danger' },
};
