import { Spinner } from './Spinner';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner label={label} />
      <span className="text-sm">{label}…</span>
    </div>
  );
}
