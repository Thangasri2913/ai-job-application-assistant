import { Zap } from 'lucide-react';

export function BrandMark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2.5 font-semibold">
      <span
        aria-hidden
        className={
          size === 'lg'
            ? 'grid size-9 place-items-center rounded-xl bg-primary text-primary-fg'
            : 'grid size-8 place-items-center rounded-lg bg-primary text-primary-fg'
        }
      >
        <Zap className="size-4" fill="currentColor" />
      </span>
      <span className={size === 'lg' ? 'text-xl' : 'text-base'}>JobAssist</span>
    </span>
  );
}
