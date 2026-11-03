import type { ResumeContent, ResumeEvidenceKind, SkillAssessment } from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import type { SkillSource } from '../catalogue/skills.js';

export interface SkillEvidence {
  strength: SkillAssessment['evidenceStrength'];
  items: SkillAssessment['resumeEvidence'];
}

const MAX_EXCERPTS = 3;
const MAX_EXCERPT_LENGTH = 160;

const excerpt = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_EXCERPT_LENGTH ? `${clean.slice(0, MAX_EXCERPT_LENGTH - 1)}…` : clean;
};

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds evidence of each skill in a resume. Deterministic and local: nothing is sent to an AI
 * provider. Matching is literal — the skill's canonical name, its listed spellings, or the
 * shared skill dictionary — so a skill is never inferred from a related one.
 *
 * Evidence is about what the resume *says*, never about proficiency: a listed skill is LISTED,
 * a skill used in experience or a project is APPLIED, and neither proves mastery.
 */
export function findResumeEvidence(
  content: ResumeContent,
  skills: SkillSource[],
): Map<string, SkillEvidence> {
  const keysBySkill = new Map(
    skills.map((s) => [s.id, new Set([s.name, ...(s.alsoKnownAs ?? [])].map(skillKey))]),
  );
  const patternBySkill = new Map(
    // Free text matches only the canonical name, as a whole word, to avoid false positives
    // from short or generic aliases ("ML", "Cloud", "Testing").
    skills.map((s) => [s.id, new RegExp(`(^|[^\\w])${escape(s.name)}(?![\\w])`, 'i')]),
  );

  const result = new Map<string, SkillEvidence>();
  const add = (skillId: string, kind: ResumeEvidenceKind, text: string, context: string | null) => {
    const entry = result.get(skillId) ?? { strength: 'NONE' as const, items: [] };
    if (entry.items.length < MAX_EXCERPTS && !entry.items.some((i) => i.excerpt === excerpt(text)))
      entry.items.push({ kind, excerpt: excerpt(text), context });
    const applied = kind === 'EXPERIENCE' || kind === 'PROJECT';
    entry.strength = applied || entry.strength === 'APPLIED' ? 'APPLIED' : 'LISTED';
    result.set(skillId, entry);
  };

  /** Skill ids named in a list of technology names. */
  const fromNames = (names: string[]) => {
    const keys = new Set(names.map(skillKey));
    return skills.filter((s) => [...keysBySkill.get(s.id)!].some((k) => keys.has(k)));
  };
  /** Skill ids mentioned in free text. */
  const fromText = (text: string) => {
    const detected = new Set(detectSkills(text).map(skillKey));
    return skills.filter(
      (s) =>
        [...keysBySkill.get(s.id)!].some((k) => detected.has(k)) ||
        patternBySkill.get(s.id)!.test(text),
    );
  };

  for (const s of fromNames(content.skills.map((e) => e.name)))
    add(
      s.id,
      'SKILLS_SECTION',
      `Skills: ${content.skills.find((e) => keysBySkill.get(s.id)!.has(skillKey(e.name)))?.name ?? s.name}`,
      null,
    );

  for (const e of content.experiences) {
    const context = [e.jobTitle, e.company].filter(Boolean).join(' at ') || null;
    for (const s of fromNames(e.technologies))
      add(s.id, 'EXPERIENCE', `Technologies: ${e.technologies.join(', ')}`, context);
    for (const line of [...e.responsibilities, ...e.achievements])
      for (const s of fromText(line)) add(s.id, 'EXPERIENCE', line, context);
  }

  for (const p of content.projects) {
    const context = p.name ?? null;
    for (const s of fromNames(p.technologies))
      add(s.id, 'PROJECT', `Technologies: ${p.technologies.join(', ')}`, context);
    for (const line of [p.description ?? '', ...p.highlights].filter(Boolean))
      for (const s of fromText(line)) add(s.id, 'PROJECT', line, context);
  }

  for (const line of [content.headline ?? '', content.summary ?? ''].filter(Boolean))
    for (const s of fromText(line)) add(s.id, 'SUMMARY', line, null);

  return result;
}
