import { forwardRef, type SelectHTMLAttributes } from 'react';
import { controlClasses } from './field-styles';

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { hasError?: boolean }
>(function Select({ hasError, className, children, ...props }, ref) {
  return (
    <select ref={ref} className={controlClasses(hasError, `h-10 ${className ?? ''}`)} {...props}>
      {children}
    </select>
  );
});
