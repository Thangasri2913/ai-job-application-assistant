import type { JobRecommendationItem } from '@job-assist/shared';
import { FileText } from 'lucide-react';
import { Link } from 'react-router';

/** The resume version a recommendation was scored with (the one to apply with). */
export function ResumeRecommendation({ resume }: { resume: JobRecommendationItem['resume'] }) {
  if (!resume?.resumeName) return null;
  const label = `${resume.resumeName}${resume.versionNumber !== null ? ` v${resume.versionNumber}` : ''}`;
  return (
    <p className="flex items-center gap-1.5 text-sm">
      <FileText className="size-3.5 text-muted" aria-hidden />
      <span className="text-muted">Recommended resume:</span>
      {resume.resumeId ? (
        <Link to={`/resumes/${resume.resumeId}`} className="font-medium hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium">{label}</span>
      )}
    </p>
  );
}
