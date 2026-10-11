import type {
  AchievementItem,
  CertificationItem,
  LanguageItem,
  EducationItem,
  ExperienceItem,
  ProfileDetails,
  ProjectItem,
  SkillItem,
} from '@job-assist/shared';
import { fromDbDate } from '../../common/dates.js';
import type {
  Achievement,
  Certification,
  Education,
  Experience,
  ProfileLanguage,
  Project,
  Skill,
  User,
  UserProfile,
} from '../../generated/prisma/client.js';

export function normalizeSkillName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function toProfileDetails(user: User, profile: UserProfile | null): ProfileDetails {
  return {
    fullName: user.fullName,
    email: user.email,
    phone: profile?.phone ?? null,
    location: profile?.location ?? null,
    country: profile?.country ?? null,
    linkedinUrl: profile?.linkedinUrl ?? null,
    githubUrl: profile?.githubUrl ?? null,
    portfolioUrl: profile?.portfolioUrl ?? null,
    preferredRoles: profile?.preferredRoles ?? [],
    preferredLocations: profile?.preferredLocations ?? [],
    workModes: profile?.workModes ?? [],
    salaryMin: profile?.salaryMin ?? null,
    salaryMax: profile?.salaryMax ?? null,
    salaryCurrency: profile?.salaryCurrency ?? null,
    employmentTypes: profile?.employmentTypes ?? [],
    noticePeriod: profile?.noticePeriod ?? null,
    workAuthorization: profile?.workAuthorization ?? null,
    headline: profile?.headline ?? null,
    summary: profile?.summary ?? null,
    yearsOfExperience: profile?.yearsOfExperience ? profile.yearsOfExperience.toNumber() : null,
    currentJobTitle: profile?.currentJobTitle ?? null,
    currentCompany: profile?.currentCompany ?? null,
    previousJobTitles: profile?.previousJobTitles ?? [],
    previousCompanies: profile?.previousCompanies ?? [],
    updatedAt: profile?.updatedAt.toISOString() ?? null,
  };
}

export const toSkillItem = (s: Skill): SkillItem => ({
  id: s.id,
  name: s.name,
  category: s.category,
});

export const toExperienceItem = (e: Experience): ExperienceItem => ({
  id: e.id,
  company: e.company,
  jobTitle: e.jobTitle,
  location: e.location,
  startDate: fromDbDate(e.startDate),
  endDate: fromDbDate(e.endDate),
  isCurrent: e.isCurrent,
  description: e.description,
  responsibilities: e.responsibilities,
  achievements: e.achievements,
  technologies: e.technologies,
});

export const toEducationItem = (e: Education): EducationItem => ({
  id: e.id,
  institution: e.institution,
  degree: e.degree,
  fieldOfStudy: e.fieldOfStudy,
  startDate: fromDbDate(e.startDate),
  endDate: fromDbDate(e.endDate),
  grade: e.grade,
});

export const toProjectItem = (p: Project): ProjectItem => ({
  id: p.id,
  name: p.name,
  description: p.description,
  role: p.role,
  technologies: p.technologies,
  responsibilities: p.responsibilities,
  achievements: p.achievements,
  url: p.url,
});

export const toCertificationItem = (c: Certification): CertificationItem => ({
  id: c.id,
  name: c.name,
  issuer: c.issuer,
  issueDate: fromDbDate(c.issueDate),
  expiryDate: fromDbDate(c.expiryDate),
  credentialId: c.credentialId,
  credentialUrl: c.credentialUrl,
});

export const toLanguageItem = (l: ProfileLanguage): LanguageItem => ({
  id: l.id,
  name: l.name,
  proficiency: l.proficiency,
});

export const toAchievementItem = (a: Achievement): AchievementItem => ({
  id: a.id,
  title: a.title,
  description: a.description,
  date: fromDbDate(a.date),
});
