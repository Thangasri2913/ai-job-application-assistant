import { EXTERNAL_RESOURCE_TYPE_LABELS, type ExternalResource } from '@job-assist/shared';
import { ExternalLink } from 'lucide-react';
import { formatDay } from '../../../shared/ui/format';

/** Only https links from the curated catalogue are rendered as links. */
const isSafeUrl = (url: string) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

const checkLabel = (resource: ExternalResource) =>
  resource.linkCheck.status === 'REACHABLE'
    ? `Link checked ${formatDay(resource.linkCheck.checkedOn)}`
    : 'Link not checked yet';

/** Curated links to external providers' material, opened in a new tab. */
export function ResourceList({ resources }: { resources: ExternalResource[] }) {
  return (
    <ul className="space-y-2">
      {resources.map((resource) => (
        <li key={resource.id} className="text-sm">
          {isSafeUrl(resource.url) ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              {resource.title}
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="font-medium">{resource.title}</span>
          )}
          <span className="block text-xs text-muted">
            {resource.provider} · {EXTERNAL_RESOURCE_TYPE_LABELS[resource.type]} · Curated external
            resource · {checkLabel(resource)}
          </span>
        </li>
      ))}
    </ul>
  );
}
