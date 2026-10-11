import {
  EMPLOYMENT_TYPES,
  NAME_MAX_LENGTH,
  SKILL_CATEGORIES,
  WORK_MODES,
} from '@job-assist/shared';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`);
const optionalUrl = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
    'Enter a full URL starting with https://',
  );
/** `<input type="month">` value (YYYY-MM) or empty. */
const month = z.string().regex(/^(\d{4}-\d{2})?$/, 'Pick a month');

export const profileDetailsSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(NAME_MAX_LENGTH),
  phone: optionalText(40),
  location: optionalText(120),
  country: optionalText(80),
  linkedinUrl: optionalUrl,
  githubUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  preferredRoles: z.array(z.string()),
  preferredLocations: z.array(z.string()),
  workModes: z.array(z.enum(WORK_MODES)),
  salaryMin: z.string().regex(/^\d*$/, 'Whole numbers only'),
  salaryMax: z.string().regex(/^\d*$/, 'Whole numbers only'),
  salaryCurrency: z
    .string()
    .trim()
    .regex(/^([A-Za-z]{3})?$/, '3-letter code, e.g. INR'),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
  noticePeriod: optionalText(80),
  workAuthorization: optionalText(200),
  headline: optionalText(150),
  summary: optionalText(4000),
  // Kept as text so "3.3" is never reformatted; validated to one decimal place.
  yearsOfExperience: z
    .string()
    .trim()
    .regex(/^(\d{1,2}(\.\d)?)?$/, 'Use a number like 3 or 3.3'),
  currentJobTitle: optionalText(120),
  currentCompany: optionalText(120),
  previousJobTitles: z.array(z.string()),
  previousCompanies: z.array(z.string()),
});
export type ProfileDetailsValues = z.infer<typeof profileDetailsSchema>;

/** Form-level check: the maximum must not be below the minimum. */
export const profileDetailsFormSchema = profileDetailsSchema.refine(
  (v) => !v.salaryMin || !v.salaryMax || Number(v.salaryMax) >= Number(v.salaryMin),
  { message: 'Maximum must not be lower than the minimum.', path: ['salaryMax'] },
);

export const skillSchema = z.object({
  name: z.string().trim().min(1, 'Enter a skill.').max(80),
  category: z.enum(SKILL_CATEGORIES),
});
export type SkillValues = z.infer<typeof skillSchema>;

const dateOrder = <T extends { startDate: string; endDate: string }>(value: T) =>
  !value.startDate || !value.endDate || value.endDate >= value.startDate;

export const experienceSchema = z
  .object({
    company: z.string().trim().min(1, 'Enter the company.').max(150),
    jobTitle: z.string().trim().min(1, 'Enter your job title.').max(150),
    location: optionalText(150),
    startDate: month,
    endDate: month,
    isCurrent: z.boolean(),
    description: optionalText(4000),
    responsibilities: z.array(z.string()),
    achievements: z.array(z.string()),
    technologies: z.array(z.string()),
  })
  .refine((v) => v.isCurrent || dateOrder(v), {
    message: 'End date must be after the start date.',
    path: ['endDate'],
  });
export type ExperienceValues = z.infer<typeof experienceSchema>;

export const educationSchema = z
  .object({
    institution: z.string().trim().min(1, 'Enter the institution.').max(200),
    degree: optionalText(150),
    fieldOfStudy: optionalText(150),
    startDate: month,
    endDate: month,
    grade: optionalText(40),
  })
  .refine(dateOrder, { message: 'End date must be after the start date.', path: ['endDate'] });
export type EducationValues = z.infer<typeof educationSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Enter the project name.').max(150),
  description: optionalText(4000),
  role: optionalText(120),
  technologies: z.array(z.string()),
  responsibilities: z.array(z.string()),
  achievements: z.array(z.string()),
  url: optionalUrl,
});
export type ProjectValues = z.infer<typeof projectSchema>;

export const certificationSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the certification name.').max(200),
    issuer: optionalText(150),
    issueDate: month,
    expiryDate: month,
    credentialId: optionalText(120),
    credentialUrl: optionalUrl,
  })
  .refine((v) => !v.issueDate || !v.expiryDate || v.expiryDate >= v.issueDate, {
    message: 'Expiry must be after the issue date.',
    path: ['expiryDate'],
  });
export type CertificationValues = z.infer<typeof certificationSchema>;

// ── Conversions between API values (null, YYYY-MM-DD) and form values ('' , YYYY-MM) ──

export const toMonthInput = (iso: string | null) => (iso ? iso.slice(0, 7) : '');
export const fromMonthInput = (value: string) => (value ? `${value}-01` : null);
export const toText = (value: string | null | undefined) => value ?? '';
export const fromText = (value: string) => (value.trim() === '' ? null : value.trim());

export const languageSchema = z.object({
  name: z.string().trim().min(1, 'Enter a language.').max(80),
  proficiency: optionalText(80),
});
export type LanguageValues = z.infer<typeof languageSchema>;

export const achievementSchema = z.object({
  title: z.string().trim().min(1, 'Enter the achievement.').max(200),
  description: optionalText(2000),
  date: month,
});
export type AchievementValues = z.infer<typeof achievementSchema>;
