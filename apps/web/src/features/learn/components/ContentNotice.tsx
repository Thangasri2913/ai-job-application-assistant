import { Info } from 'lucide-react';

/** Explains how to read the provenance labels on Learn & Prepare content. */
export function ContentNotice() {
  return (
    <aside
      aria-label="About this content"
      className="mb-6 flex items-start gap-2.5 rounded-lg bg-surface-muted px-3.5 py-3 text-sm text-muted"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        Lessons, activities and projects are AI-generated and have not yet been reviewed by an
        expert. Use them as a study guide and check details against the curated external resources,
        which link to each provider’s official material. A link check confirms only that a page was
        reachable, not that its content was reviewed. Finishing a lesson is not proof of a skill;
        only assessments record skill evidence.
      </p>
    </aside>
  );
}
