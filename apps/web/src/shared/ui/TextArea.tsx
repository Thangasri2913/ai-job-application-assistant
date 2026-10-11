import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { controlClasses } from './field-styles';

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { hasError?: boolean }
>(function TextArea({ hasError, className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={controlClasses(hasError, `py-2 ${className ?? ''}`)}
      {...props}
    />
  );
});
