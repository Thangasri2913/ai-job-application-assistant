import { LEARNING_ROLE_LABELS, LEARNING_ROLES, type LearningRole } from '@job-assist/shared';
import type { CatalogueSkill } from './types.js';

const MAX_FOCUS_SKILLS = 3;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface MessageHints {
  /** Catalogue skill ids named in the message (at most 3). */
  skillIds: string[];
  /** A role named by its full label, e.g. "data analyst". */
  role: LearningRole | null;
}

/**
 * Reads the (untrusted) message only to recognise catalogue skill names and role labels, as
 * whole words. The result can narrow tool results; it never selects tools, data or actions.
 */
export function readMessageHints(
  message: string | undefined,
  skills: Iterable<CatalogueSkill>,
): MessageHints {
  if (!message?.trim()) return { skillIds: [], role: null };
  const found: string[] = [];
  for (const skill of skills) {
    const names = [skill.name, ...skill.alsoKnownAs].filter((n) => n.length >= 2);
    if (names.some((n) => new RegExp(`(^|[^\\w])${escape(n)}(?![\\w])`, 'i').test(message)))
      found.push(skill.id);
  }
  // Letters and digits only, so "front-end developer" matches "Frontend Developer".
  const text = squash(message);
  const role = LEARNING_ROLES.find((r) => text.includes(squash(LEARNING_ROLE_LABELS[r]))) ?? null;
  return { skillIds: found.slice(0, MAX_FOCUS_SKILLS), role };
}
