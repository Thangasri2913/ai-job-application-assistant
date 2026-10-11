import type { ResumeContent } from '@job-assist/shared';
import { fromDbDate, toDbDate } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { normalizeSkillName } from '../profile/profile.mapper.js';

type Tx = Prisma.TransactionClient;

/** Prisma include that loads a version's normalised content in display order. */
export const CONTENT_INCLUDE = {
  skills: { orderBy: { sortOrder: 'asc' } },
  experiences: { orderBy: { sortOrder: 'asc' } },
  educations: { orderBy: { sortOrder: 'asc' } },
  projects: { orderBy: { sortOrder: 'asc' } },
  certifications: { orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.ResumeVersionInclude;

export type VersionWithContent = Prisma.ResumeVersionGetPayload<{
  include: typeof CONTENT_INCLUDE;
}>;

/** Rebuilds the API `ResumeContent` from a version's normalised columns and rows. */
export function contentFromVersion(v: VersionWithContent): ResumeContent | null {
  if (!v.hasContent) return null;
  return {
    contact: {
      fullName: v.contactFullName,
      email: v.contactEmail,
      phone: v.contactPhone,
      location: v.contactLocation,
      linkedinUrl: v.contactLinkedinUrl,
      githubUrl: v.contactGithubUrl,
      portfolioUrl: v.contactPortfolioUrl,
    },
    headline: v.headline,
    summary: v.summary,
    skills: v.skills.map((s) => ({ name: s.name, category: s.category })),
    experiences: v.experiences.map((e) => ({
      company: e.company,
      jobTitle: e.jobTitle,
      location: e.location,
      startDate: fromDbDate(e.startDate),
      endDate: fromDbDate(e.endDate),
      isCurrent: e.isCurrent,
      responsibilities: e.responsibilities,
      achievements: e.achievements,
      technologies: e.technologies,
    })),
    educations: v.educations.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      startDate: fromDbDate(e.startDate),
      endDate: fromDbDate(e.endDate),
      grade: e.grade,
    })),
    projects: v.projects.map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies,
      highlights: p.highlights,
      url: p.url,
    })),
    certifications: v.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: fromDbDate(c.date),
    })),
    achievements: v.achievements,
    languages: v.languages,
    estimatedYearsOfExperience: v.yearsOfExperience ? v.yearsOfExperience.toNumber() : null,
  };
}

/**
 * Replaces a version's structured content. Callers must only use this on DRAFT versions
 * (or while creating a version); ACTIVE/ARCHIVED versions are frozen.
 */
export async function writeContent(
  tx: Tx,
  versionId: string,
  content: ResumeContent,
  options: { confirmed: boolean },
): Promise<void> {
  const where = { versionId };
  await Promise.all([
    tx.resumeVersionSkill.deleteMany({ where }),
    tx.resumeVersionExperience.deleteMany({ where }),
    tx.resumeVersionEducation.deleteMany({ where }),
    tx.resumeVersionProject.deleteMany({ where }),
    tx.resumeVersionCertification.deleteMany({ where }),
  ]);

  await tx.resumeVersion.update({
    where: { id: versionId },
    data: {
      hasContent: true,
      ...(options.confirmed ? { contentConfirmedAt: new Date() } : {}),
      contactFullName: content.contact.fullName,
      contactEmail: content.contact.email,
      contactPhone: content.contact.phone,
      contactLocation: content.contact.location,
      contactLinkedinUrl: content.contact.linkedinUrl,
      contactGithubUrl: content.contact.githubUrl,
      contactPortfolioUrl: content.contact.portfolioUrl,
      headline: content.headline,
      summary: content.summary,
      yearsOfExperience: content.estimatedYearsOfExperience,
      achievements: content.achievements,
      languages: content.languages,
    },
  });

  // One row per skill per version (case-insensitive).
  const seen = new Set<string>();
  const skills = content.skills.filter((s) => {
    const key = normalizeSkillName(s.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  await Promise.all([
    tx.resumeVersionSkill.createMany({
      data: skills.map((s, i) => ({
        versionId,
        sortOrder: i,
        name: s.name,
        normalizedName: normalizeSkillName(s.name),
        category: s.category,
      })),
    }),
    tx.resumeVersionExperience.createMany({
      data: content.experiences.map((e, i) => ({
        versionId,
        sortOrder: i,
        company: e.company,
        jobTitle: e.jobTitle,
        location: e.location,
        startDate: toDbDate(e.startDate),
        endDate: toDbDate(e.endDate),
        isCurrent: e.isCurrent,
        responsibilities: e.responsibilities,
        achievements: e.achievements,
        technologies: e.technologies,
      })),
    }),
    tx.resumeVersionEducation.createMany({
      data: content.educations.map((e, i) => ({
        versionId,
        sortOrder: i,
        institution: e.institution,
        degree: e.degree,
        fieldOfStudy: e.fieldOfStudy,
        startDate: toDbDate(e.startDate),
        endDate: toDbDate(e.endDate),
        grade: e.grade,
      })),
    }),
    tx.resumeVersionProject.createMany({
      data: content.projects.map((p, i) => ({
        versionId,
        sortOrder: i,
        name: p.name,
        description: p.description,
        technologies: p.technologies,
        highlights: p.highlights,
        url: p.url,
      })),
    }),
    tx.resumeVersionCertification.createMany({
      data: content.certifications.map((c, i) => ({
        versionId,
        sortOrder: i,
        name: c.name,
        issuer: c.issuer,
        date: toDbDate(c.date),
      })),
    }),
  ]);
}
