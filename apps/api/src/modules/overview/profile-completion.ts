import type {
  CareerProfile,
  ProfileCompletion,
  ProfileCompletionItem,
  ProfileCompletionKey,
} from '@job-assist/shared';

export const MIN_SKILLS_FOR_COMPLETION = 5;

interface Rule {
  key: ProfileCompletionKey;
  label: string;
  weight: number;
  hint: string;
  isComplete: (profile: CareerProfile, activeResumeCount: number) => boolean;
}

/**
 * Transparent, documented completion rules (docs/ARCHITECTURE.md § Profile completion).
 * Each item is all-or-nothing; weights sum to 100.
 */
export const COMPLETION_RULES: readonly Rule[] = [
  {
    key: 'BASIC_INFO',
    label: 'Basic information',
    weight: 10,
    hint: 'Add your phone number and location.',
    isComplete: ({ details }) => Boolean(details.fullName && details.phone && details.location),
  },
  {
    key: 'LINKS',
    label: 'Professional links',
    weight: 5,
    hint: 'Add a LinkedIn, GitHub or portfolio link.',
    isComplete: ({ details }) =>
      Boolean(details.linkedinUrl || details.githubUrl || details.portfolioUrl),
  },
  {
    key: 'SUMMARY',
    label: 'Professional summary',
    weight: 10,
    hint: 'Write a short professional summary.',
    isComplete: ({ details }) => Boolean(details.summary && details.summary.trim().length >= 50),
  },
  {
    key: 'PREFERENCES',
    label: 'Job preferences',
    weight: 10,
    hint: 'Add at least one preferred role and work mode.',
    isComplete: ({ details }) => details.preferredRoles.length > 0 && details.workModes.length > 0,
  },
  {
    key: 'EXPERIENCE',
    label: 'Work experience',
    weight: 20,
    hint: 'Add your work experience.',
    isComplete: ({ experiences }) => experiences.length > 0,
  },
  {
    key: 'SKILLS',
    label: 'Skills',
    weight: 15,
    hint: `Add at least ${MIN_SKILLS_FOR_COMPLETION} skills.`,
    isComplete: ({ skills }) => skills.length >= MIN_SKILLS_FOR_COMPLETION,
  },
  {
    key: 'EDUCATION',
    label: 'Education',
    weight: 10,
    hint: 'Add your education.',
    isComplete: ({ educations }) => educations.length > 0,
  },
  {
    key: 'PROJECTS',
    label: 'Projects',
    weight: 10,
    hint: 'Add a project you have worked on.',
    isComplete: ({ projects }) => projects.length > 0,
  },
  {
    key: 'RESUME',
    label: 'Resume',
    weight: 10,
    hint: 'Add at least one active resume to your library.',
    isComplete: (_profile, activeResumeCount) => activeResumeCount > 0,
  },
];

export function computeProfileCompletion(
  profile: CareerProfile,
  activeResumeCount: number,
): ProfileCompletion {
  const items: ProfileCompletionItem[] = COMPLETION_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    weight: rule.weight,
    hint: rule.hint,
    complete: rule.isComplete(profile, activeResumeCount),
  }));
  const percentage = items.reduce((sum, item) => sum + (item.complete ? item.weight : 0), 0);
  const missingSections = items.filter((item) => !item.complete).map((item) => item.key);
  return { percentage, items, missingSections };
}
