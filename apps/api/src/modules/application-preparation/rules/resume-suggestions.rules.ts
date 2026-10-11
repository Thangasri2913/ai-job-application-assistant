import type { SuggestionKind, SuggestionSection } from '@job-assist/shared';
import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import type { PreparationContext } from '../preparation-context.js';

export interface DraftSuggestion {
  kind: SuggestionKind;
  section: SuggestionSection;
  originalText: string | null;
  suggestedText: string | null;
  reason: string;
  jobRequirement: string | null;
  confidence: number | null;
  /** Machine-readable target for REORDER. */
  target: ReorderTarget | null;
}

export type ReorderTarget =
  { type: 'bullet'; experienceIndex: number; line: string } | { type: 'skills'; order: string[] };

const MAX_GAPS = 6;

/**
 * Suggestions derived only from the stored match evidence, the resume version and the
 * career profile. They never add content: they point out gaps, buried relevant content and
 * better ordering of what the user already wrote.
 */
export function ruleSuggestions(ctx: PreparationContext): DraftSuggestion[] {
  const { content } = ctx.resume;
  const evidence = ctx.match.evidence;
  const out: DraftSuggestion[] = [];

  const profileSkillKeys = new Set(
    [
      ...ctx.profile.skills.map((s) => s.name),
      ...ctx.profile.experiences.flatMap((e) => e.technologies),
      ...detectSkills(
        ctx.profile.experiences
          .flatMap((e) => [...e.responsibilities, ...e.achievements])
          .join('\n'),
      ),
    ].map(skillKey),
  );

  // 1. Relevant bullets that are buried: move them to the top of their role.
  const wanted = ctx.job.requirements.filter(
    (r) => r.type === 'SKILL' && r.importance === 'REQUIRED',
  );
  const matchedLines = new Set(
    evidence.responsibilities.map((r) => r.matchedLine).filter((l): l is string => !!l),
  );
  content.experiences.forEach((exp, experienceIndex) => {
    const bullets = exp.responsibilities;
    bullets.forEach((line, position) => {
      if (position < 2) return;
      const skills = detectSkills(line).filter((s) =>
        wanted.some((w) => w.normalizedName === skillKey(s)),
      );
      if (skills.length === 0 && !matchedLines.has(line)) return;
      const role = [exp.jobTitle, exp.company].filter(Boolean).join(' at ');
      out.push({
        kind: 'REORDER',
        section: 'EXPERIENCE',
        originalText: line,
        suggestedText: line,
        reason: skills.length
          ? `This bullet shows ${skills.join(', ')}, which the job requires, but it is bullet ${position + 1} under ${role}. Consider moving it to the top of that role.`
          : `This bullet matches one of the job’s responsibilities, but it is bullet ${position + 1} under ${role}. Consider moving it to the top of that role.`,
        jobRequirement: skills.join(', ') || null,
        confidence: null,
        target: { type: 'bullet', experienceIndex, line },
      });
    });
  });

  // 2. Skills section: list the job's required, then preferred, matches first.
  const jobSkillOrder = [
    ...ctx.job.requirements.filter((r) => r.type === 'SKILL' && r.importance === 'REQUIRED'),
    ...ctx.job.requirements.filter((r) => r.type === 'SKILL' && r.importance === 'PREFERRED'),
  ].map((r) => r.normalizedName);
  const current = content.skills.map((s) => s.name);
  const rank = (name: string) => {
    const i = jobSkillOrder.indexOf(skillKey(name));
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const reordered = current
    .map((name, i) => ({ name, i }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.i - b.i)
    .map((x) => x.name);
  const relevantCount = current.filter((n) => rank(n) !== Number.MAX_SAFE_INTEGER).length;
  if (
    relevantCount > 0 &&
    reordered.slice(0, relevantCount).join('|') !== current.slice(0, relevantCount).join('|')
  ) {
    out.push({
      kind: 'REORDER',
      section: 'SKILLS',
      originalText: current.join(', '),
      suggestedText: reordered.join(', '),
      reason: `List the ${relevantCount} skill${relevantCount === 1 ? '' : 's'} this job asks for first, so they are seen immediately. No skills are added or removed.`,
      jobRequirement: reordered.slice(0, relevantCount).join(', '),
      confidence: null,
      target: { type: 'skills', order: reordered },
    });
  }

  // 3. Required skills shown only outside work experience.
  for (const s of evidence.skills) {
    if (
      s.importance !== 'REQUIRED' ||
      s.status === 'MISSING' ||
      s.location === 'EXPERIENCE' ||
      s.location === 'RELATED_SKILL'
    )
      continue;
    const where =
      s.location === 'SKILLS'
        ? 'the skills section'
        : s.location === 'PROJECTS'
          ? 'a project'
          : s.location === 'CERTIFICATIONS'
            ? 'a certification'
            : 'the summary';
    const section: SuggestionSection =
      s.location === 'PROJECTS'
        ? 'PROJECT'
        : s.location === 'CERTIFICATIONS'
          ? 'CERTIFICATIONS'
          : s.location === 'SUMMARY'
            ? 'SUMMARY'
            : 'SKILLS';
    out.push({
      kind: 'EMPHASIZE',
      section,
      originalText: null,
      suggestedText: null,
      reason: `The job requires ${s.skill}. This resume shows it only in ${where}. If you used ${s.skill} in one of your roles, describe that in the role’s bullets — only if it is true.`,
      jobRequirement: s.skill,
      confidence: null,
      target: null,
    });
  }

  // 4. Missing skills: be explicit, never fill the gap.
  const missing = evidence.skills.filter((s) => s.status === 'MISSING');
  for (const s of missing.filter((m) => m.importance === 'REQUIRED').slice(0, MAX_GAPS)) {
    const inProfile = profileSkillKeys.has(s.normalizedName);
    out.push(
      inProfile
        ? {
            kind: 'EMPHASIZE',
            section: 'SKILLS',
            originalText: null,
            suggestedText: null,
            reason: `The job requires ${s.skill}. Your career profile lists ${s.skill}, but this resume version doesn’t. If it reflects real experience, consider adding it to this resume.`,
            jobRequirement: s.skill,
            confidence: null,
            target: null,
          }
        : {
            kind: 'GAP',
            section: 'SKILLS',
            originalText: null,
            suggestedText: null,
            reason: `The job requires ${s.skill}, but no ${s.skill} experience was found in this resume or your career profile. Do not add ${s.skill} unless you genuinely have this experience.`,
            jobRequirement: s.skill,
            confidence: null,
            target: null,
          },
    );
  }
  const missingPreferred = missing
    .filter((m) => m.importance === 'PREFERRED' && !profileSkillKeys.has(m.normalizedName))
    .map((m) => m.skill);
  if (missingPreferred.length > 0) {
    out.push({
      kind: 'GAP',
      section: 'SKILLS',
      originalText: null,
      suggestedText: null,
      reason: `The job lists ${missingPreferred.join(', ')} as nice to have. ${missingPreferred.length === 1 ? 'It was' : 'They were'} not found in this resume or your career profile. Leave ${missingPreferred.length === 1 ? 'it' : 'them'} out unless you genuinely have this experience.`,
      jobRequirement: missingPreferred.join(', '),
      confidence: null,
      target: null,
    });
  }
  return out;
}
