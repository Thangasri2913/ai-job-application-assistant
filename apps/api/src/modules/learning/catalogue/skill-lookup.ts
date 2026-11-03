import { skillKey } from '../../../common/skills/skill-normalization.js';
import type { SkillSource } from './skills.js';

/**
 * Maps a skill name (as written in a resume or job requirement) to a catalogue skill id, using
 * the canonical name and listed spellings only. Returns null for skills not in the catalogue.
 */
export function createSkillLookup(skills: Iterable<SkillSource>): (name: string) => string | null {
  const byKey = new Map<string, string>();
  for (const s of skills)
    for (const name of [s.name, ...(s.alsoKnownAs ?? [])]) byKey.set(skillKey(name), s.id);
  return (name: string) => byKey.get(skillKey(name)) ?? null;
}
