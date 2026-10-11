import {
  EMPLOYMENT_TYPE_LABELS,
  type JobAnalysisResult,
  SENIORITY_LABELS,
} from '@job-assist/shared';
import { Badge } from '../../../shared/ui/Badge';

const AI_TEXT: Record<JobAnalysisResult['aiStatus'], string> = {
  DISABLED: 'Not used (no AI provider configured): rule-based analysis only.',
  VALID: 'Used. Every AI finding was checked against the posting; unsupported ones were dropped.',
  INVALID: 'Attempted, but the output failed validation and was discarded.',
  FAILED: 'Attempted, but the AI service was unavailable.',
};

/** What the analysis found, with where each piece came from. */
export function JobSummary({ analysis }: { analysis: JobAnalysisResult }) {
  return (
    <div className="grid gap-4 text-sm">
      {analysis.summary ? (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            From the posting
          </p>
          <p>{analysis.summary}</p>
        </div>
      ) : null}
      {analysis.aiSummary ? (
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
            AI summary <Badge tone="primary">AI-generated</Badge>
          </p>
          <p>{analysis.aiSummary}</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted">Seniority</dt>
        <dd>
          {analysis.seniority ? SENIORITY_LABELS[analysis.seniority] : 'Not stated'}
          {analysis.seniorityOrigin === 'INFERRED' ? (
            <span className="text-muted"> (inferred from the required years)</span>
          ) : null}
        </dd>
        <dt className="text-muted">Employment type</dt>
        <dd>
          {analysis.employmentType ? EMPLOYMENT_TYPE_LABELS[analysis.employmentType] : 'Not stated'}
        </dd>
        <dt className="text-muted">Keywords</dt>
        <dd>{analysis.keywords.join(', ') || 'None found'}</dd>
        <dt className="text-muted">Analysis detail</dt>
        <dd>
          {analysis.confidence !== null
            ? `${Math.round(analysis.confidence * 100)}% of the usual structure found`
            : '—'}
        </dd>
        <dt className="text-muted">AI</dt>
        <dd>
          {AI_TEXT[analysis.aiStatus]}
          {analysis.aiNote ? <span className="block text-muted">{analysis.aiNote}</span> : null}
        </dd>
      </dl>
    </div>
  );
}
