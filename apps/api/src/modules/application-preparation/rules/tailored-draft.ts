import type { ResumeContent } from '@job-assist/shared';
import type { ReorderTarget } from './resume-suggestions.rules.js';

export interface AppliedSuggestion {
  id: string;
  kind: 'REWRITE' | 'REORDER' | 'EMPHASIZE' | 'GAP';
  originalText: string | null;
  /** The final wording: the user's edit, or the accepted suggestion. */
  finalText: string | null;
  target: ReorderTarget | null;
}

const same = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * The source version's content with accepted/edited suggestions applied, as a separate draft.
 * Reorders are applied before rewrites so text targets still match. The source is not mutated.
 */
export function applySuggestions(
  source: ResumeContent,
  suggestions: AppliedSuggestion[],
): { content: ResumeContent; applied: string[] } {
  const content = structuredClone(source);
  const applied: string[] = [];
  const ordered = [...suggestions].sort(
    (a, b) => Number(a.kind === 'REWRITE') - Number(b.kind === 'REWRITE'),
  );

  for (const s of ordered) {
    if (s.kind === 'REORDER' && s.target?.type === 'skills') {
      const byName = new Map(content.skills.map((k) => [k.name, k]));
      const next = s.target.order
        .map((n) => byName.get(n))
        .filter((k): k is NonNullable<typeof k> => !!k);
      const rest = content.skills.filter(
        (k) => !s.target || !(s.target.type === 'skills' && s.target.order.includes(k.name)),
      );
      content.skills = [...next, ...rest];
      applied.push(s.id);
    } else if (s.kind === 'REORDER' && s.target?.type === 'bullet') {
      const exp = content.experiences[s.target.experienceIndex];
      const target = s.target.line;
      const i = exp?.responsibilities.findIndex((l) => same(l, target)) ?? -1;
      if (exp && i >= 0) {
        const [line] = exp.responsibilities.splice(i, 1);
        // The user may also reword the bullet they move up (their own words).
        exp.responsibilities.unshift(
          s.finalText && !same(s.finalText, line!) ? s.finalText : line!,
        );
        applied.push(s.id);
      }
    } else if (s.kind === 'REWRITE' && s.originalText && s.finalText) {
      if (replaceLine(content, s.originalText, s.finalText)) applied.push(s.id);
    }
  }
  return { content, applied };
}

function replaceLine(c: ResumeContent, original: string, replacement: string): boolean {
  if (c.summary && same(c.summary, original)) return ((c.summary = replacement), true);
  if (c.headline && same(c.headline, original)) return ((c.headline = replacement), true);
  for (const e of c.experiences) {
    for (const list of [e.responsibilities, e.achievements]) {
      const i = list.findIndex((l) => same(l, original));
      if (i >= 0) return ((list[i] = replacement), true);
    }
  }
  for (const p of c.projects) {
    if (p.description && same(p.description, original))
      return ((p.description = replacement), true);
    const i = p.highlights.findIndex((l) => same(l, original));
    if (i >= 0) return ((p.highlights[i] = replacement), true);
  }
  const i = c.achievements.findIndex((l) => same(l, original));
  if (i >= 0) return ((c.achievements[i] = replacement), true);
  return false;
}

/** Every line of resume content that a REWRITE may target. */
export function rewritableLines(c: ResumeContent): string[] {
  return [
    c.headline,
    c.summary,
    ...c.experiences.flatMap((e) => [...e.responsibilities, ...e.achievements]),
    ...c.projects.flatMap((p) => [p.description, ...p.highlights]),
    ...c.achievements,
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}
