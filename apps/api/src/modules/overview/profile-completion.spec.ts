import type { CareerProfile } from '@job-assist/shared';
import { COMPLETION_RULES, computeProfileCompletion } from './profile-completion.js';

const emptyProfile = (): CareerProfile => ({
  details: {
    fullName: 'Priya Sharma',
    email: 'p@example.com',
    phone: null,
    location: null,
    country: null,
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    preferredRoles: [],
    preferredLocations: [],
    workModes: [],
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    employmentTypes: [],
    noticePeriod: null,
    workAuthorization: null,
    headline: null,
    summary: null,
    yearsOfExperience: null,
    currentJobTitle: null,
    currentCompany: null,
    previousJobTitles: [],
    previousCompanies: [],
    updatedAt: null,
  },
  skills: [],
  experiences: [],
  educations: [],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
});

describe('computeProfileCompletion', () => {
  it('has weights that sum to exactly 100', () => {
    expect(COMPLETION_RULES.reduce((sum, r) => sum + r.weight, 0)).toBe(100);
  });

  it('is 0% for a brand-new account and lists every missing item with a hint', () => {
    const result = computeProfileCompletion(emptyProfile(), 0);
    expect(result.percentage).toBe(0);
    expect(result.items.every((i) => !i.complete && i.hint.length > 0)).toBe(true);
  });

  it('adds exactly the weight of each completed item', () => {
    const profile = emptyProfile();
    profile.details.phone = '+91 98765 43210';
    profile.details.location = 'Chennai';
    profile.details.githubUrl = 'https://github.com/p';
    profile.skills = ['Angular', 'TypeScript', 'RxJS', 'HTML', 'SCSS'].map((name, i) => ({
      id: String(i),
      name,
      category: 'FRONTEND',
    }));

    const result = computeProfileCompletion(profile, 1);
    // basic 10 + links 5 + skills 15 + resume 10
    expect(result.percentage).toBe(40);
    expect(result.items.find((i) => i.key === 'SKILLS')?.complete).toBe(true);
    expect(result.items.find((i) => i.key === 'EXPERIENCE')?.complete).toBe(false);
  });

  it('requires at least five skills and a substantive summary', () => {
    const profile = emptyProfile();
    profile.skills = [{ id: '1', name: 'Angular', category: 'FRONTEND' }];
    profile.details.summary = 'Developer.';
    const result = computeProfileCompletion(profile, 0);
    expect(result.items.find((i) => i.key === 'SKILLS')?.complete).toBe(false);
    expect(result.items.find((i) => i.key === 'SUMMARY')?.complete).toBe(false);
  });
});
