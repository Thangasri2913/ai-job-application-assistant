import { forwardRef, type InputHTMLAttributes, useId } from 'react';

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string }
>(function Checkbox({ label, id, ...props }, ref) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="size-4 rounded border-border accent-primary"
        {...props}
      />
      {label}
    </label>
  );
});
