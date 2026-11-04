import type { SkillJudgementBasis } from '@job-assist/shared';

/** How each skill judgement was reached — shown on every skill so nothing unmeasured looks mastered. */
export const BASIS_LABELS: Record<
  SkillJudgementBasis,
  { label: string; tone: 'success' | 'primary' | 'neutral' | 'warning'; help: string }
> = {
  MEASURED: {
    label: 'Measured',
    tone: 'success',
    help: 'A diagnostic asked enough questions about this skill to measure the fundamentals.',
  },
  USER_CORRECTED: {
    label: 'You corrected this',
    tone: 'primary',
    help: 'Your own correction decides this skill for this plan only. It is not stored.',
  },
  RESUME_EVIDENCE: {
    label: 'From your resume',
    tone: 'neutral',
    help: 'Inferred from what your resume says. Proficiency is not measured.',
  },
  UNKNOWN: {
    label: 'Unknown',
    tone: 'warning',
    help: 'No assessment, resume evidence or correction yet.',
  },
};
