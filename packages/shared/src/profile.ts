/** Career profile contract. The profile is the user's source of truth. */

export const WORK_MODES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
  ONSITE: 'On-site',
};

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
  'TEMPORARY',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  FREELANCE: 'Freelance',
  INTERNSHIP: 'Internship',
  TEMPORARY: 'Temporary',
};

export const SKILL_CATEGORIES = [
  'FRONTEND',
  'BACKEND',
  'DATABASE',
  'CLOUD',
  'DEVOPS',
  'TESTING',
  'ARCHITECTURE',
  'AI',
  'TOOLS',
  'SOFT_SKILLS',
  'OTHER',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  DATABASE: 'Database',
  CLOUD: 'Cloud',
  DEVOPS: 'DevOps',
  TESTING: 'Testing',
  ARCHITECTURE: 'Architecture',
  AI: 'AI/ML',
  TOOLS: 'Tools',
  SOFT_SKILLS: 'Soft Skills',
  OTHER: 'Other',
};

/** Calendar dates are exchanged as `YYYY-MM-DD` strings (no time zone). */
export type IsoDate = string;

export interface ProfileDetails {
  fullName: string;
  /** Account email; read-only here. */
  email: string;
  phone: string | null;
  location: string | null;
  country: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  preferredRoles: string[];
  preferredLocations: string[];
  workModes: WorkMode[];
  salaryMin: number | null;
  salaryMax: number | null;
  /** ISO 4217 code, e.g. INR. */
  salaryCurrency: string | null;
  employmentTypes: EmploymentType[];
  noticePeriod: string | null;
  workAuthorization: string | null;
  /** One-line professional headline, e.g. "Senior Angular Developer". */
  headline: string | null;
  summary: string | null;
  /** Exactly as the user entered it (e.g. 3.3). */
  yearsOfExperience: number | null;
  currentJobTitle: string | null;
  currentCompany: string | null;
  previousJobTitles: string[];
  previousCompanies: string[];
  updatedAt: string | null;
}

export type UpdateProfileRequest = Omit<ProfileDetails, 'email' | 'updatedAt'>;

export interface SkillItem {
  id: string;
  name: string;
  category: SkillCategory;
}
export interface SkillInput {
  name: string;
  category: SkillCategory;
}

export interface ExperienceItem {
  id: string;
  company: string;
  jobTitle: string;
  location: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  isCurrent: boolean;
  description: string | null;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
}
export type ExperienceInput = Omit<ExperienceItem, 'id'>;

export interface EducationItem {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  grade: string | null;
}
export type EducationInput = Omit<EducationItem, 'id'>;

export interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  role: string | null;
  technologies: string[];
  responsibilities: string[];
  achievements: string[];
  url: string | null;
}
export type ProjectInput = Omit<ProjectItem, 'id'>;

export interface CertificationItem {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: IsoDate | null;
  expiryDate: IsoDate | null;
  credentialId: string | null;
  credentialUrl: string | null;
}
export type CertificationInput = Omit<CertificationItem, 'id'>;

export interface LanguageItem {
  id: string;
  name: string;
  proficiency: string | null;
}
export type LanguageInput = Omit<LanguageItem, 'id'>;

export interface AchievementItem {
  id: string;
  title: string;
  description: string | null;
  date: IsoDate | null;
}
export type AchievementInput = Omit<AchievementItem, 'id'>;

/** Sections that support user-defined ordering via PUT /profile/{section}/order. */
export const ORDERABLE_PROFILE_SECTIONS = [
  'experiences',
  'education',
  'projects',
  'certifications',
  'languages',
  'achievements',
] as const;
export type OrderableProfileSection = (typeof ORDERABLE_PROFILE_SECTIONS)[number];

export interface CareerProfile {
  details: ProfileDetails;
  skills: SkillItem[];
  experiences: ExperienceItem[];
  educations: EducationItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  languages: LanguageItem[];
  achievements: AchievementItem[];
}

export const PROFILE_COMPLETION_ITEMS = [
  'BASIC_INFO',
  'LINKS',
  'SUMMARY',
  'PREFERENCES',
  'EXPERIENCE',
  'SKILLS',
  'EDUCATION',
  'PROJECTS',
  'RESUME',
] as const;
export type ProfileCompletionKey = (typeof PROFILE_COMPLETION_ITEMS)[number];

export interface ProfileCompletionItem {
  key: ProfileCompletionKey;
  label: string;
  /** Percentage points this item contributes when complete. Weights sum to 100. */
  weight: number;
  complete: boolean;
  /** What to do to complete it. */
  hint: string;
}

export interface ProfileCompletion {
  percentage: number;
  items: ProfileCompletionItem[];
  /** Keys of the items that are not complete yet, in display order. */
  missingSections: ProfileCompletionKey[];
}

/**
 * Items the user explicitly selected while reviewing a parsed resume.
 * Import only ADDS list entries and fills EMPTY scalar fields — it never overwrites.
 */
export interface ImportToProfileRequest {
  details?: Partial<
    Pick<
      UpdateProfileRequest,
      | 'phone'
      | 'location'
      | 'linkedinUrl'
      | 'githubUrl'
      | 'portfolioUrl'
      | 'headline'
      | 'summary'
      | 'currentJobTitle'
    >
  >;
  skills?: SkillInput[];
  experiences?: ExperienceInput[];
  educations?: EducationInput[];
  projects?: ProjectInput[];
  certifications?: CertificationInput[];
  languages?: LanguageInput[];
}

export interface ImportToProfileResult {
  filledFields: string[];
  skippedFields: string[];
  added: {
    skills: number;
    experiences: number;
    educations: number;
    projects: number;
    certifications: number;
    languages: number;
  };
  skippedDuplicateSkills: string[];
  skippedDuplicateLanguages: string[];
}
