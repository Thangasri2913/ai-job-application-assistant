import { FlaskConical } from 'lucide-react';
import { SAMPLE_DATA_NOTICE } from '@job-assist/shared';

/** Makes development fixture data impossible to mistake for real listings. */
export function SampleDataNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
        <FlaskConical className="size-3" aria-hidden />
        Sample data
      </span>
    );
  }
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Development mode.</span> {SAMPLE_DATA_NOTICE}
      </p>
    </div>
  );
}
