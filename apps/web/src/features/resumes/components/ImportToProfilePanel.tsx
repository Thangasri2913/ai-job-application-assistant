import type { ImportToProfileResult, ResumeContent } from '@job-assist/shared';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../../lib/api/api-error';
import { Alert } from '../../../shared/ui/Alert';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';
import { Checkbox } from '../../../shared/ui/Checkbox';
import { useImportToProfile } from '../../career-profile/hooks/useProfile';
import { buildImportRequest, type ImportSectionKey as SectionKey } from './import-request';

/**
 * Lets the user copy reviewed resume data into their career profile, section by section.
 * Nothing is selected by default and existing profile values are never overwritten.
 */
export function ImportToProfilePanel({ content }: { content: ResumeContent }) {
  const importer = useImportToProfile();
  const [result, setResult] = useState<ImportToProfileResult | null>(null);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
    details: false,
    skills: false,
    experiences: false,
    educations: false,
    projects: false,
    certifications: false,
  });

  const options: { key: SectionKey; label: string; count: number | null }[] = [
    {
      key: 'details',
      label: 'Contact details, headline and summary (only fills empty fields)',
      count: null,
    },
    { key: 'skills', label: 'Skills', count: content.skills.length },
    {
      key: 'experiences',
      label: 'Experience',
      count: content.experiences.filter((e) => e.company && e.jobTitle).length,
    },
    {
      key: 'educations',
      label: 'Education',
      count: content.educations.filter((e) => e.institution).length,
    },
    { key: 'projects', label: 'Projects', count: content.projects.filter((p) => p.name).length },
    { key: 'certifications', label: 'Certifications', count: content.certifications.length },
  ];
  const anySelected = Object.values(selected).some(Boolean);

  return (
    <Card aria-labelledby="import-heading">
      <h2 id="import-heading" className="flex items-center gap-2 text-base font-semibold">
        <UserPlus className="size-4.5" aria-hidden />
        Add to my career profile
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Optional. Choose what to copy into your profile. Existing profile information is never
        overwritten, and skills you already have are skipped.
      </p>
      <div className="grid gap-2">
        {options.map((o) => (
          <Checkbox
            key={o.key}
            label={o.count === null ? o.label : `${o.label} (${o.count})`}
            checked={selected[o.key]}
            disabled={o.count === 0}
            onChange={(e) => setSelected((s) => ({ ...s, [o.key]: e.target.checked }))}
          />
        ))}
      </div>
      {importer.isError ? (
        <div className="mt-3">
          <Alert>{errorMessage(importer.error)}</Alert>
        </div>
      ) : null}
      {result ? (
        <div className="mt-3">
          <Alert tone="success">
            Added {result.added.skills} skills, {result.added.experiences} experience,{' '}
            {result.added.educations} education, {result.added.projects} projects and{' '}
            {result.added.certifications} certifications
            {result.filledFields.length > 0 ? `; filled ${result.filledFields.join(', ')}` : ''}.
            {result.skippedFields.length > 0
              ? ` Kept your existing ${result.skippedFields.join(', ')}.`
              : ''}{' '}
            <Link to="/profile" className="font-medium underline">
              View profile
            </Link>
          </Alert>
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button
          variant="secondary"
          disabled={!anySelected}
          loading={importer.isPending}
          onClick={() =>
            importer.mutate(buildImportRequest(content, selected), { onSuccess: setResult })
          }
        >
          Add selected to profile
        </Button>
      </div>
    </Card>
  );
}
