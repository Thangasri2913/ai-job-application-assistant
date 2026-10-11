import type { ApplicationSummary } from '@job-assist/shared';
import { Link } from 'react-router';
import { formatDate } from '../../../shared/ui/format';

/** Compact card for the pipeline board. */
export function ApplicationCard({ application }: { application: ApplicationSummary }) {
  return (
    <li className="rounded-lg border border-border bg-surface p-3 text-sm shadow-xs">
      <Link
        to={`/applications/${application.id}`}
        className="font-medium hover:text-primary hover:underline"
      >
        {application.jobTitle}
      </Link>
      <p className="text-muted">{application.companyName}</p>
      <p className="mt-1 text-xs text-muted">
        {application.resume.resumeName} v{application.resume.versionNumber} · updated{' '}
        {formatDate(application.updatedAt)}
      </p>
    </li>
  );
}
