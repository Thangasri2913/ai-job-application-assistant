import type { ResumeContent, SkillCategory } from '@job-assist/shared';

// Form shape mirrors ResumeContent, using '' for empty text and YYYY-MM for months.
export interface ExperienceForm {
  company: string;
  jobTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
}
interface EducationForm {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  grade: string;
}
interface ProjectForm {
  name: string;
  description: string;
  technologies: string[];
  highlights: string[];
  url: string;
}
interface CertificationForm {
  name: string;
  issuer: string;
  date: string;
}
export interface ContentFormValues {
  contact: Record<keyof ResumeContent['contact'], string>;
  headline: string;
  summary: string;
  skills: { name: string; category: SkillCategory }[];
  experiences: ExperienceForm[];
  educations: EducationForm[];
  projects: ProjectForm[];
  certifications: CertificationForm[];
  achievements: string[];
  languages: string[];
  estimatedYearsOfExperience: string;
}

const t = (v: string | null) => v ?? '';
const n = (v: string) => (v.trim() === '' ? null : v.trim());
const toMonth = (iso: string | null) => (iso ? iso.slice(0, 7) : '');
const fromMonth = (v: string) => (v ? `${v}-01` : null);

export function toFormValues(c: ResumeContent): ContentFormValues {
  return {
    contact: {
      fullName: t(c.contact.fullName),
      email: t(c.contact.email),
      phone: t(c.contact.phone),
      location: t(c.contact.location),
      linkedinUrl: t(c.contact.linkedinUrl),
      githubUrl: t(c.contact.githubUrl),
      portfolioUrl: t(c.contact.portfolioUrl),
    },
    headline: t(c.headline),
    summary: t(c.summary),
    skills: c.skills.map((s) => ({ ...s })),
    experiences: c.experiences.map((e) => ({
      company: t(e.company),
      jobTitle: t(e.jobTitle),
      location: t(e.location),
      startDate: toMonth(e.startDate),
      endDate: toMonth(e.endDate),
      isCurrent: e.isCurrent,
      responsibilities: e.responsibilities,
      achievements: e.achievements,
      technologies: e.technologies,
    })),
    educations: c.educations.map((e) => ({
      institution: t(e.institution),
      degree: t(e.degree),
      fieldOfStudy: t(e.fieldOfStudy),
      startDate: toMonth(e.startDate),
      endDate: toMonth(e.endDate),
      grade: t(e.grade),
    })),
    projects: c.projects.map((p) => ({
      name: t(p.name),
      description: t(p.description),
      technologies: p.technologies,
      highlights: p.highlights,
      url: t(p.url),
    })),
    certifications: c.certifications.map((x) => ({
      name: x.name,
      issuer: t(x.issuer),
      date: toMonth(x.date),
    })),
    achievements: c.achievements,
    languages: c.languages,
    estimatedYearsOfExperience:
      c.estimatedYearsOfExperience === null ? '' : String(c.estimatedYearsOfExperience),
  };
}

export function fromFormValues(v: ContentFormValues): ResumeContent {
  const years = Number(v.estimatedYearsOfExperience);
  return {
    contact: {
      fullName: n(v.contact.fullName),
      email: n(v.contact.email),
      phone: n(v.contact.phone),
      location: n(v.contact.location),
      linkedinUrl: n(v.contact.linkedinUrl),
      githubUrl: n(v.contact.githubUrl),
      portfolioUrl: n(v.contact.portfolioUrl),
    },
    headline: n(v.headline),
    summary: n(v.summary),
    skills: v.skills
      .filter((s) => s.name.trim())
      .map((s) => ({ name: s.name.trim(), category: s.category })),
    experiences: v.experiences
      .map((e) => ({
        company: n(e.company),
        jobTitle: n(e.jobTitle),
        location: n(e.location),
        startDate: fromMonth(e.startDate),
        endDate: e.isCurrent ? null : fromMonth(e.endDate),
        isCurrent: e.isCurrent,
        responsibilities: e.responsibilities,
        achievements: e.achievements,
        technologies: e.technologies,
      }))
      .filter((e) => e.company || e.jobTitle),
    educations: v.educations
      .map((e) => ({
        institution: n(e.institution),
        degree: n(e.degree),
        fieldOfStudy: n(e.fieldOfStudy),
        startDate: fromMonth(e.startDate),
        endDate: fromMonth(e.endDate),
        grade: n(e.grade),
      }))
      .filter((e) => e.institution || e.degree),
    projects: v.projects
      .map((p) => ({
        name: n(p.name),
        description: n(p.description),
        technologies: p.technologies,
        highlights: p.highlights,
        url: n(p.url),
      }))
      .filter((p) => p.name),
    certifications: v.certifications
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name.trim(), issuer: n(c.issuer), date: fromMonth(c.date) })),
    achievements: v.achievements,
    languages: v.languages,
    estimatedYearsOfExperience:
      v.estimatedYearsOfExperience.trim() === '' || Number.isNaN(years)
        ? null
        : Math.round(years * 10) / 10,
  };
}
