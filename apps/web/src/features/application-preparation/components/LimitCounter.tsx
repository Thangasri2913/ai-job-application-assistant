import { type AnswerLimits, checkLimits } from '@job-assist/shared';
import { cn } from '../../../shared/ui/cn';

/** "186 / 200 words · 1,020 / 1,500 characters", red when over. */
export function LimitCounter({ text, limits }: { text: string; limits: AnswerLimits }) {
  const c = checkLimits(text, limits);
  const parts = [
    limits.maxWords !== null ? `${c.words} / ${limits.maxWords} words` : `${c.words} words`,
    limits.maxCharacters !== null ? `${c.characters} / ${limits.maxCharacters} characters` : null,
  ].filter(Boolean);
  return (
    <p
      className={cn(
        'text-xs tabular-nums',
        c.withinLimits ? 'text-muted' : 'font-medium text-danger',
      )}
      aria-live="polite"
    >
      {parts.join(' · ')}
      {c.withinLimits ? '' : ' — over the limit'}
    </p>
  );
}
