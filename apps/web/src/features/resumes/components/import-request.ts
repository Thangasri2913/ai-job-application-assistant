import type { ImportToProfileRequest, ResumeContent } from '@job-assist/shared';

export type ImportSectionKey =
  'details' | 'skills' | 'experiences' | 'educations' | 'projects' | 'certifications';

/** Builds the import request from the user's reviewed content and their explicit selections. */
export function buildImportRequest(
  content: ResumeContent,
  selected: Record<ImportSectionKey, boolean>,
): ImportToProfileRequest {
  const req: ImportToProfileRequest = {};
  if (selected.details) {
    req.details = {
      phone: content.contact.phone,
      location: content.contact.location,
      linkedinUrl: content.contact.linkedinUrl,
      githubUrl: content.contact.githubUrl,
      portfolioUrl: content.contact.portfolioUrl,
      headline: content.headline,
      summary: content.summary,
    };
  }
  if (selected.skills) req.skills = content.skills;
  if (selected.experiences) {
    req.experiences = content.experiences
      .filter((e) => e.company && e.jobTitle)
      .map((e) => ({
        company: e.company!,
        jobTitle: e.jobTitle!,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        description: null,
        responsibilities: e.responsibilities,
        achievements: e.achievements,
        technologies: e.technologies,
      }));
  }
  if (selected.educations) {
    req.educations = content.educations
      .filter((e) => e.institution)
      .map((e) => ({
        institution: e.institution!,
        degree: e.degree,
        fieldOfStudy: e.fieldOfStudy,
        startDate: e.startDate,
        endDate: e.endDate,
        grade: e.grade,
      }));
  }
  if (selected.projects) {
    req.projects = content.projects
      .filter((p) => p.name)
      .map((p) => ({
        name: p.name!,
        description: p.description,
        role: null,
        technologies: p.technologies,
        responsibilities: p.highlights,
        achievements: [],
        url: p.url,
      }));
  }
  if (selected.certifications) {
    req.certifications = content.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      issueDate: c.date,
      expiryDate: null,
      credentialId: null,
      credentialUrl: null,
    }));
  }
  return req;
}
