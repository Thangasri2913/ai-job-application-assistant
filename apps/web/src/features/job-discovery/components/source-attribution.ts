import type { SourceAttribution } from '@job-assist/shared';

/**
 * Attribution for a stored job from a source that requires one, derived from the job itself:
 * Adzuna ads link to Adzuna's local site, which is where the posting URL points.
 */
export function attributionForJob(job: {
  source: string | null;
  jobUrl: string | null;
}): SourceAttribution | null {
  if (job.source !== 'Adzuna' || !job.jobUrl) return null;
  try {
    const url = new URL(job.jobUrl);
    return /(^|\.)adzuna\./.test(url.hostname)
      ? { label: 'Jobs by Adzuna', url: url.origin }
      : null;
  } catch {
    return null;
  }
}
