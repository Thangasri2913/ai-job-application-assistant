import type { CareerProfile, ResumeContent } from '@job-assist/shared';
import { estimateYearsOfExperience } from '../../resumes/parsing/resume-parser.js';
import type { MatchSubject } from './match-scorer.js';

const present = (values: (string | null | undefined)[]) =>
  values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

/** A resume version's confirmed content as a match subject. Only stored data is used. */
export function subjectFromResume(content: ResumeContent, now: Date): MatchSubject {
  const estimated = estimateYearsOfExperience(content.experiences, now);
  return {
    label: 'this resume',
    skills: content.skills.map((s) => s.name),
    experiences: content.experiences.map((e) => ({
      jobTitle: e.jobTitle,
      company: e.company,
      technologies: e.technologies,
      lines: [...e.responsibilities, ...e.achievements],
    })),
    projects: content.projects.map((p) => ({
      name: p.name,
      technologies: p.technologies,
      lines: present([p.description, ...p.highlights]),
    })),
    certifications: content.certifications.map((c) => ({ name: c.name, issuer: c.issuer })),
    educations: content.educations.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
    })),
    summary:
      present([content.headline, content.summary, ...content.achievements]).join('\n') || null,
    // The figure confirmed during review wins; otherwise compute it from the experience dates.
    yearsOfExperience: content.estimatedYearsOfExperience ?? estimated,
    yearsSource:
      content.estimatedYearsOfExperience !== null
        ? 'as confirmed on this resume'
        : estimated !== null
          ? 'estimated from experience dates'
          : null,
  };
}

/** The career profile as a match subject. */
export function subjectFromProfile(profile: CareerProfile, now: Date): MatchSubject {
  const estimated = estimateYearsOfExperience(profile.experiences, now);
  const d = profile.details;
  return {
    label: 'your profile',
    skills: profile.skills.map((s) => s.name),
    experiences: profile.experiences.map((e) => ({
      jobTitle: e.jobTitle,
      company: e.company,
      technologies: e.technologies,
      lines: present([e.description, ...e.responsibilities, ...e.achievements]),
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      technologies: p.technologies,
      lines: present([p.description, p.role, ...p.responsibilities, ...p.achievements]),
    })),
    certifications: profile.certifications.map((c) => ({ name: c.name, issuer: c.issuer })),
    educations: profile.educations.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
    })),
    summary:
      present([
        d.headline,
        d.summary,
        ...profile.achievements.map((a) => [a.title, a.description].filter(Boolean).join(': ')),
      ]).join('\n') || null,
    yearsOfExperience: d.yearsOfExperience ?? estimated,
    yearsSource:
      d.yearsOfExperience !== null
        ? 'as stated in your profile'
        : estimated !== null
          ? 'estimated from experience dates'
          : null,
  };
}
