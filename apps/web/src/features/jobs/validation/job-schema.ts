import {
  type CreateJobRequest,
  EMPLOYMENT_TYPES,
  JOB_COMPANY_MAX_LENGTH,
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_DESCRIPTION_MIN_LENGTH,
  JOB_LOCATION_MAX_LENGTH,
  JOB_SOURCE_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@job-assist/shared';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters.`);

export const jobFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter the job title.').max(JOB_TITLE_MAX_LENGTH),
  companyName: z.string().trim().min(1, 'Enter the company name.').max(JOB_COMPANY_MAX_LENGTH),
  description: z
    .string()
    .trim()
    .min(
      JOB_DESCRIPTION_MIN_LENGTH,
      `Paste the full job description (at least ${JOB_DESCRIPTION_MIN_LENGTH} characters) so it can be analysed.`,
    )
    .max(JOB_DESCRIPTION_MAX_LENGTH, 'This description is too long.'),
  jobUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v),
      'Enter a full URL starting with https://',
    ),
  location: optionalText(JOB_LOCATION_MAX_LENGTH),
  employmentType: z.union([z.enum(EMPLOYMENT_TYPES), z.literal('')]),
  source: optionalText(JOB_SOURCE_MAX_LENGTH),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const emptyJobForm: JobFormValues = {
  title: '',
  companyName: '',
  description: '',
  jobUrl: '',
  location: '',
  employmentType: '',
  source: '',
};

/** Form values → API request (blank optional fields become null). */
export function toJobRequest(v: JobFormValues): CreateJobRequest {
  const orNull = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    title: v.title.trim(),
    companyName: v.companyName.trim(),
    description: v.description.trim(),
    jobUrl: orNull(v.jobUrl),
    location: orNull(v.location),
    employmentType: v.employmentType === '' ? null : v.employmentType,
    source: orNull(v.source),
  };
}
