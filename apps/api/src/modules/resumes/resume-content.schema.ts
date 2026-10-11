import { type ResumeContent, SKILL_CATEGORIES } from '@job-assist/shared';
import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));
const isoDate = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Expected YYYY-MM-DD')
  .nullable();
const textList = (maxItems: number, maxLength: number) => z.array(text(maxLength)).max(maxItems);
const url = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .nullable();

/**
 * Single schema for structured resume content. Used to validate:
 *  - content the user confirms/edits (PATCH …/extracted-data),
 *  - optional AI structuring output before it is stored,
 *  - parser output (defensive).
 */
export const resumeContentSchema = z.object({
  contact: z.object({
    fullName: nullableText(120),
    email: z.email().max(254).nullable(),
    phone: nullableText(40),
    location: nullableText(120),
    linkedinUrl: url,
    githubUrl: url,
    portfolioUrl: url,
  }),
  // Defaults to null so content stored before headlines existed still validates.
  headline: nullableText(200).default(null),
  summary: nullableText(4000),
  skills: z.array(z.object({ name: text(80), category: z.enum(SKILL_CATEGORIES) })).max(300),
  experiences: z
    .array(
      z.object({
        company: nullableText(150),
        jobTitle: nullableText(150),
        location: nullableText(150),
        startDate: isoDate,
        endDate: isoDate,
        isCurrent: z.boolean(),
        responsibilities: textList(50, 1000),
        achievements: textList(50, 1000),
        technologies: textList(60, 80),
      }),
    )
    .max(50),
  educations: z
    .array(
      z.object({
        institution: nullableText(200),
        degree: nullableText(150),
        fieldOfStudy: nullableText(150),
        startDate: isoDate,
        endDate: isoDate,
        grade: nullableText(40),
      }),
    )
    .max(20),
  projects: z
    .array(
      z.object({
        name: nullableText(150),
        description: nullableText(4000),
        technologies: textList(60, 80),
        highlights: textList(50, 1000),
        url,
      }),
    )
    .max(50),
  certifications: z
    .array(z.object({ name: text(200), issuer: nullableText(150), date: isoDate }))
    .max(50),
  achievements: textList(50, 1000),
  // Default keeps extraction stored before languages were parsed readable.
  languages: textList(30, 80).default([]),
  estimatedYearsOfExperience: z.number().min(0).max(70).nullable(),
}) satisfies z.ZodType<ResumeContent, unknown>;

export function emptyResumeContent(): ResumeContent {
  return {
    contact: {
      fullName: null,
      email: null,
      phone: null,
      location: null,
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
    },
    headline: null,
    summary: null,
    skills: [],
    experiences: [],
    educations: [],
    projects: [],
    certifications: [],
    achievements: [],
    languages: [],
    estimatedYearsOfExperience: null,
  };
}
