import type { ResumeSummary } from '@job-assist/shared';
import { Archive, ArchiveRestore, Copy, Pencil, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { buttonClasses } from '../../../shared/ui/button-classes';
import { formatDate } from '../../../shared/ui/format';
import { useResumeAction } from '../hooks/useResumes';
import { resumesApi } from '../services/resumes-api';
import { ResumeMetaDialog } from './ResumeMetaDialog';
import { VersionAttention } from './resume-status';

export function ResumeCard({ resume }: { resume: ResumeSummary }) {
  const [editing, setEditing] = useState(false);
  const duplicate = useResumeAction(() => resumesApi.duplicate(resume.id));
  const archive = useResumeAction(() =>
    resume.status === 'ARCHIVED' ? resumesApi.restore(resume.id) : resumesApi.archive(resume.id),
  );
  const makeDefault = useResumeAction(() => resumesApi.setDefault(resume.id));
  const error = duplicate.error ?? archive.error ?? makeDefault.error;
  const shown = resume.currentVersion ?? resume.latestVersion;

  return (
    <li className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            <Link to={`/resumes/${resume.id}`} className="hover:text-primary hover:underline">
              {resume.name}
            </Link>
            {resume.isDefault ? (
              <Badge tone="primary">
                <Star className="mr-1 size-3" fill="currentColor" aria-hidden />
                Default
              </Badge>
            ) : null}
            {resume.status === 'ARCHIVED' ? <Badge>Archived</Badge> : null}
            <VersionAttention resume={resume} />
          </h3>
          <p className="mt-1 text-sm text-muted">
            {resume.category ? (
              <span className="font-medium text-fg">{resume.category} · </span>
            ) : null}
            Updated {formatDate(resume.updatedAt)}
            {shown ? ` · v${shown.versionNumber}` : ''}
            {` · ${resume.versionCount} version${resume.versionCount === 1 ? '' : 's'}`}
          </p>
          {resume.tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tags">
              {resume.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-muted"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/resumes/${resume.id}`} className={buttonClasses('secondary', 'sm')}>
          View
        </Link>
        <Link to={`/resumes/${resume.id}#versions`} className={buttonClasses('ghost', 'sm')}>
          Versions
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={duplicate.isPending}
          onClick={() => duplicate.mutate(undefined)}
        >
          <Copy className="size-3.5" aria-hidden />
          Duplicate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={archive.isPending}
          onClick={() => archive.mutate(undefined)}
        >
          {resume.status === 'ARCHIVED' ? (
            <ArchiveRestore className="size-3.5" aria-hidden />
          ) : (
            <Archive className="size-3.5" aria-hidden />
          )}
          {resume.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
        </Button>
        {resume.status === 'ACTIVE' && !resume.isDefault ? (
          <Button
            variant="ghost"
            size="sm"
            loading={makeDefault.isPending}
            onClick={() => makeDefault.mutate(undefined)}
          >
            <Star className="size-3.5" aria-hidden />
            Set as default
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {errorMessage(error)}
        </p>
      ) : null}

      <ResumeMetaDialog resume={resume} open={editing} onClose={() => setEditing(false)} />
    </li>
  );
}
