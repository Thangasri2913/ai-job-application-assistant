import type { SourceAttribution as Attribution } from '@job-assist/shared';
import { ExternalLink } from 'lucide-react';

/** The attribution a job source's terms require next to each displayed job (e.g. "Jobs by Adzuna"). */
export function SourceAttribution({ attribution }: { attribution: Attribution }) {
  return (
    <a
      href={attribution.url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      {attribution.label}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
