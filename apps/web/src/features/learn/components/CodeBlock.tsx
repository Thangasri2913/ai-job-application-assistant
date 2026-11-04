import type { CodeSnippet } from '@job-assist/shared';

/** Code shown as text. Never executed or rendered as HTML. */
export function CodeBlock({ code, label }: { code: CodeSnippet; label?: string }) {
  return (
    <figure className="my-2">
      <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
        {label ?? code.language}
      </figcaption>
      <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs leading-relaxed">
        <code>{code.source}</code>
      </pre>
    </figure>
  );
}
