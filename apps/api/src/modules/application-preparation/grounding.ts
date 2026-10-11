import type { CareerProfile, ResumeContent } from '@job-assist/shared';
import { detectSkills, skillKey } from '../../common/skills/skill-normalization.js';

/**
 * The candidate's verified facts (selected resume version + career profile). Anything the AI
 * writes is checked against these: it may not introduce a skill/technology or a number
 * (metric, year, count) that the user's own data doesn't contain.
 */
export interface VerifiedFacts {
  text: string;
  skillKeys: Set<string>;
  numbers: Set<string>;
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const normalizeNumber = (n: string) => n.replace(/,/g, '');

export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(normalizeNumber);
}

export function resumeText(c: ResumeContent): string[] {
  return [
    c.contact.fullName,
    c.headline,
    c.summary,
    ...c.skills.map((s) => s.name),
    ...c.experiences.flatMap((e) => [
      e.jobTitle,
      e.company,
      e.location,
      e.startDate,
      e.endDate,
      ...e.responsibilities,
      ...e.achievements,
      ...e.technologies,
    ]),
    ...c.educations.flatMap((e) => [
      e.institution,
      e.degree,
      e.fieldOfStudy,
      e.startDate,
      e.endDate,
      e.grade,
    ]),
    ...c.projects.flatMap((p) => [p.name, p.description, ...p.technologies, ...p.highlights]),
    ...c.certifications.flatMap((x) => [x.name, x.issuer, x.date]),
    ...c.achievements,
    ...c.languages,
    c.estimatedYearsOfExperience !== null ? String(c.estimatedYearsOfExperience) : null,
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

export function profileText(p: CareerProfile): string[] {
  const d = p.details;
  return [
    d.fullName,
    d.headline,
    d.summary,
    d.location,
    d.country,
    d.currentJobTitle,
    d.currentCompany,
    d.noticePeriod,
    d.workAuthorization,
    d.salaryCurrency,
    d.salaryMin !== null ? String(d.salaryMin) : null,
    d.salaryMax !== null ? String(d.salaryMax) : null,
    d.yearsOfExperience !== null ? String(d.yearsOfExperience) : null,
    ...d.previousJobTitles,
    ...d.previousCompanies,
    ...d.preferredRoles,
    ...d.preferredLocations,
    ...p.skills.map((s) => s.name),
    ...p.experiences.flatMap((e) => [
      e.jobTitle,
      e.company,
      e.location,
      e.description,
      e.startDate,
      e.endDate,
      ...e.responsibilities,
      ...e.achievements,
      ...e.technologies,
    ]),
    ...p.educations.flatMap((e) => [
      e.institution,
      e.degree,
      e.fieldOfStudy,
      e.startDate,
      e.endDate,
      e.grade,
    ]),
    ...p.projects.flatMap((x) => [
      x.name,
      x.description,
      x.role,
      ...x.technologies,
      ...x.responsibilities,
      ...x.achievements,
    ]),
    ...p.certifications.flatMap((x) => [x.name, x.issuer, x.issueDate]),
    ...p.languages.flatMap((l) => [l.name, l.proficiency]),
    ...p.achievements.flatMap((a) => [a.title, a.description]),
  ].filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

export function buildVerifiedFacts(resume: ResumeContent, profile: CareerProfile): VerifiedFacts {
  const lines = [...resumeText(resume), ...profileText(profile)];
  const text = lines.join('\n');
  return {
    text,
    skillKeys: new Set(
      [
        ...detectSkills(text),
        ...resume.skills.map((s) => s.name),
        ...profile.skills.map((s) => s.name),
      ].map(skillKey),
    ),
    numbers: new Set(numbersIn(text)),
  };
}

export interface Unsupported {
  skills: string[];
  numbers: string[];
}

/** Skills and numbers in `text` that the verified facts don't contain. */
export function unsupportedClaims(
  text: string,
  facts: VerifiedFacts,
  extraNumbers: Iterable<string> = [],
): Unsupported {
  const allowedNumbers = new Set([...facts.numbers, ...extraNumbers]);
  return {
    skills: detectSkills(text).filter((s) => !facts.skillKeys.has(skillKey(s))),
    numbers: [...new Set(numbersIn(text))].filter((n) => !allowedNumbers.has(n)),
  };
}

export const isGrounded = (u: Unsupported) => u.skills.length === 0 && u.numbers.length === 0;

export function describeUnsupported(u: Unsupported): string {
  return [
    u.skills.length ? `skills not in your data: ${u.skills.join(', ')}` : null,
    u.numbers.length ? `numbers not in your data: ${u.numbers.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}
