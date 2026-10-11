import { detectSkills, skillKey } from '../../../common/skills/skill-normalization.js';
import type { PreparationContext } from '../preparation-context.js';

export interface TemplateLetter {
  text: string;
  notClaimed: string[];
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/**
 * A cover letter built only from verified data: the role, the most relevant experience
 * (bullets quoted verbatim) and the required skills the resume actually shows. Required skills
 * that aren't shown are listed in `notClaimed` and are never mentioned in the letter.
 */
export function templateCoverLetter(ctx: PreparationContext): TemplateLetter {
  const { content } = ctx.resume;
  const evidence = ctx.match.evidence;
  const required = ctx.job.requirements.filter(
    (r) => r.type === 'SKILL' && r.importance === 'REQUIRED',
  );
  const shown = evidence.skills
    .filter((s) => s.importance === 'REQUIRED' && s.status === 'MATCH')
    .map((s) => s.skill);
  const notClaimed = evidence.skills
    .filter((s) => s.importance === 'REQUIRED' && s.status !== 'MATCH')
    .map((s) => s.skill);

  // The role with the most required skills and matched responsibilities.
  const wanted = new Set(required.map((r) => r.normalizedName));
  const matchedLines = new Set(
    evidence.responsibilities.map((r) => r.matchedLine).filter((l): l is string => !!l),
  );
  const scored = content.experiences.map((e, i) => {
    const lines = [...e.responsibilities, ...e.achievements];
    const skills = new Set([...e.technologies, ...detectSkills(lines.join('\n'))].map(skillKey));
    const score =
      [...wanted].filter((k) => skills.has(k)).length +
      lines.filter((l) => matchedLines.has(l)).length;
    return { e, i, score, lines };
  });
  const best = [...scored].sort((a, b) => b.score - a.score || a.i - b.i)[0];
  const bullets = best
    ? [...best.lines]
        .sort(
          (a, b) =>
            Number(matchedLines.has(b) || detectSkills(b).some((s) => wanted.has(skillKey(s)))) -
            Number(matchedLines.has(a) || detectSkills(a).some((s) => wanted.has(skillKey(s)))),
        )
        .slice(0, 3)
    : [];

  const paragraphs: string[] = ['Dear Hiring Team,'];
  const intro = [`I am applying for the ${ctx.job.title} position at ${ctx.job.companyName}.`];
  if (content.headline)
    intro.push(`I currently work as a ${content.headline.replace(/^(a|an)\s+/i, '')}.`);
  paragraphs.push(intro.join(' '));
  if (best && bullets.length > 0) {
    const role = [best.e.jobTitle, best.e.company].filter(Boolean).join(' at ');
    paragraphs.push(
      `In my role as ${role}, my work has included:\n${bullets.map((b) => `- ${b}`).join('\n')}`,
    );
  }
  if (shown.length > 0) {
    // Only requirements the resume shows are named; unmet ones are reported in notClaimed instead.
    paragraphs.push(
      `My resume shows hands-on experience with ${list(shown)}, which this role asks for.`,
    );
  }
  const { requiredYears, candidateYears } = evidence.experience;
  if (requiredYears !== null && candidateYears !== null && candidateYears >= requiredYears) {
    paragraphs.push(`I have ${candidateYears} years of professional experience.`);
  }
  paragraphs.push(
    `Thank you for considering my application. I would welcome the opportunity to discuss how my experience fits the ${ctx.job.title} role.`,
  );
  paragraphs.push(`Regards,\n${ctx.candidateName}`);
  return { text: paragraphs.join('\n\n'), notClaimed };
}
