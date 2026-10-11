import type {
  ApplicationDetail,
  ApplicationSummary,
  ApplicationTimelineEvent,
  CareerProfile,
  JobAnalysisResult,
  JobDetail,
  JobMatchesResponse,
  JobSummary,
  MatchAnalysisItem,
  ProfileCompletion,
  ResumeDetail,
  ResumeRecommendationItem,
  ResumeVersionSummary,
} from '@job-assist/shared';

export const currentUser = {
  id: 'u1',
  email: 'priya@example.com',
  fullName: 'Priya Sharma',
  roles: ['user'],
  createdAt: '2026-01-01T00:00:00.000Z',
};
/** GET /auth/me response for a signed-in user. */
export const meOk = { body: currentUser };

export function completion(percentage = 0): ProfileCompletion {
  return {
    percentage,
    items: [
      {
        key: 'BASIC_INFO',
        label: 'Basic information',
        weight: 10,
        complete: percentage > 0,
        hint: 'Add your phone number and location.',
      },
      {
        key: 'PROJECTS',
        label: 'Projects',
        weight: 10,
        complete: false,
        hint: 'Add a project you have worked on.',
      },
    ],
    missingSections: percentage > 0 ? ['PROJECTS'] : ['BASIC_INFO', 'PROJECTS'],
  };
}

export function emptyProfile(): CareerProfile {
  return {
    details: {
      fullName: 'Priya Sharma',
      email: 'priya@example.com',
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
  };
}

export function version(overrides: Partial<ResumeVersionSummary> = {}): ResumeVersionSummary {
  return {
    id: 'v1',
    versionNumber: 1,
    status: 'ACTIVE',
    source: 'UPLOAD',
    parseStatus: 'COMPLETED',
    hasFile: true,
    notes: null,
    parentVersionId: null,
    hasAiExtraction: false,
    contentConfirmedAt: '2026-10-01T10:00:00.000Z',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    activatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function resume(overrides: Partial<ResumeDetail> = {}): ResumeDetail {
  const v = version();
  return {
    id: 'r1',
    name: 'Angular Developer',
    description: null,
    category: null,
    tags: ['Angular'],
    status: 'ACTIVE',
    isDefault: false,
    archivedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    versionCount: 1,
    currentVersion: v,
    latestVersion: v,
    versions: [v],
    ...overrides,
  };
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export function jobSummary(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'j1',
    title: 'Frontend Developer',
    companyName: 'Example Corp',
    location: 'Chennai',
    employmentType: 'FULL_TIME',
    source: null,
    jobUrl: null,
    status: 'ACTIVE',
    origin: 'MANUAL',
    isSampleData: false,
    inLibrary: true,
    createdAt: '2026-10-11T09:00:00.000Z',
    updatedAt: '2026-10-11T09:00:00.000Z',
    analysisStatus: 'COMPLETED',
    bestMatch: { score: 86, level: 'EXCELLENT', resumeName: 'Angular Resume' },
    selectedResumeName: null,
    ...overrides,
  };
}

export function recommendationItem(
  overrides: Partial<ResumeRecommendationItem> = {},
): ResumeRecommendationItem {
  return {
    id: 'rec1',
    analysisId: 'a1',
    matchAnalysisId: 'm1',
    resumeId: 'r1',
    resumeVersionId: 'v1',
    resumeName: 'Angular Resume',
    versionNumber: 3,
    score: 86,
    level: 'EXCELLENT',
    reasons: ['Matches 3 of 3 required skills: Angular, TypeScript, RxJS'],
    gaps: ['Preferred skills not found: AWS'],
    generatedAt: '2026-10-11T09:01:00.000Z',
    ...overrides,
  };
}

export function jobDetail(overrides: Partial<JobDetail> = {}): JobDetail {
  return {
    ...jobSummary(),
    description: 'We are looking for a frontend developer.\n\nRequirements:\n- Angular',
    archivedAt: null,
    currentAnalysisId: 'a1',
    latestAnalysis: {
      id: 'a1',
      status: 'COMPLETED',
      error: null,
      createdAt: '2026-10-11T09:00:30.000Z',
      completedAt: '2026-10-11T09:01:00.000Z',
      outdated: false,
    },
    recommendation: recommendationItem(),
    selectedResume: null,
    application: null,
    ...overrides,
  };
}

export function matchItem(overrides: Partial<MatchAnalysisItem> = {}): MatchAnalysisItem {
  return {
    id: 'm1',
    subjectType: 'RESUME_VERSION',
    resumeId: 'r1',
    resumeVersionId: 'v1',
    resumeName: 'Angular Resume',
    versionNumber: 3,
    isDefaultResume: false,
    overallScore: 86,
    level: 'EXCELLENT',
    scores: {
      skills: 92,
      experience: 88,
      responsibilities: 84,
      projects: 80,
      education: null,
      keywords: 75,
    },
    strengths: ['Matches 3 of 3 required skills: Angular, TypeScript, RxJS'],
    gaps: ['Preferred skills not found: AWS'],
    evidence: {
      skills: [
        {
          skill: 'Angular',
          normalizedName: 'angular',
          importance: 'REQUIRED',
          status: 'MATCH',
          credit: 1,
          location: 'EXPERIENCE',
          evidence: 'This resume lists it in work experience: Frontend Developer at Acme.',
        },
        {
          skill: 'AWS',
          normalizedName: 'aws',
          importance: 'PREFERRED',
          status: 'MISSING',
          credit: 0,
          location: null,
          evidence: 'No AWS experience was found in this resume.',
        },
      ],
      experience: {
        requiredYears: 3,
        candidateYears: 4,
        yearsSource: 'stated',
        relevantTitles: ['Frontend Developer at Acme'],
        notes: ['4 years of experience (stated) vs 3+ years asked for.'],
      },
      responsibilities: [
        {
          responsibility: 'Develop reusable UI components',
          status: 'MATCH',
          matchedLine: 'Developed reusable UI components for the design system',
        },
      ],
      projects: [],
      education: { requirement: null, candidateHighest: null, met: null, notes: [] },
      keywords: { matched: ['Angular'], missing: ['AWS'] },
    },
    rank: 1,
    createdAt: '2026-10-11T09:01:00.000Z',
    ...overrides,
  };
}

export function matchesResponse(overrides: Partial<JobMatchesResponse> = {}): JobMatchesResponse {
  return {
    analysisId: 'a1',
    weights: {
      skills: 40,
      experience: 25,
      responsibilities: 15,
      projects: 10,
      education: 5,
      keywords: 5,
    },
    profile: matchItem({
      id: 'mp',
      subjectType: 'PROFILE',
      resumeId: null,
      resumeVersionId: null,
      resumeName: null,
      versionNumber: null,
      rank: null,
      overallScore: 70,
      level: 'STRONG',
    }),
    resumes: [
      matchItem(),
      matchItem({
        id: 'm2',
        resumeId: 'r2',
        resumeVersionId: 'v2',
        resumeName: 'React Resume',
        versionNumber: 1,
        overallScore: 74,
        level: 'STRONG',
        rank: 2,
        strengths: ['Matches 1 of 3 required skills: TypeScript'],
        gaps: ['Required skills not found: Angular, RxJS'],
      }),
    ],
    excluded: [
      {
        resumeId: 'r9',
        resumeName: 'Draft Resume',
        reason: 'No reviewed version yet. Review the uploaded resume to include it.',
      },
    ],
    stale: false,
    ...overrides,
  };
}

export function analysisResult(overrides: Partial<JobAnalysisResult> = {}): JobAnalysisResult {
  const req = (
    id: string,
    type: JobAnalysisResult['requirements'][number]['type'],
    name: string,
    importance: 'REQUIRED' | 'PREFERRED' = 'REQUIRED',
  ) => ({
    id,
    type,
    name,
    normalizedName: name.toLowerCase(),
    importance,
    origin: 'EXPLICIT' as const,
    detectedBy: 'PARSER' as const,
    evidence: name,
    minYears: type === 'EXPERIENCE' ? 3 : null,
  });
  return {
    id: 'a1',
    jobId: 'j1',
    status: 'COMPLETED',
    error: null,
    analyzerVersion: 'job-analyzer@1',
    summary: 'We are looking for a frontend developer.',
    aiSummary: null,
    seniority: 'MID',
    seniorityOrigin: 'INFERRED',
    employmentType: 'FULL_TIME',
    keywords: ['Angular', 'SaaS'],
    confidence: 0.9,
    aiStatus: 'DISABLED',
    aiNote: null,
    aiProvider: null,
    requirements: [
      req('q1', 'SKILL', 'Angular'),
      req('q2', 'SKILL', 'TypeScript'),
      req('q3', 'SKILL', 'AWS', 'PREFERRED'),
      req('q4', 'EXPERIENCE', '3+ years of professional experience'),
      req('q5', 'RESPONSIBILITY', 'Develop reusable UI components'),
    ],
    outdated: false,
    createdAt: '2026-10-11T09:00:30.000Z',
    completedAt: '2026-10-11T09:01:00.000Z',
    ...overrides,
  };
}

// ─── Applications ─────────────────────────────────────────────────────────────

export function applicationSummary(
  overrides: Partial<ApplicationSummary> = {},
): ApplicationSummary {
  return {
    id: 'ap1',
    jobId: 'j1',
    jobTitle: 'Frontend Developer',
    companyName: 'Example Corp',
    status: 'APPLIED',
    resume: {
      resumeId: 'r1',
      resumeName: 'Angular Resume',
      resumeVersionId: 'v1',
      versionNumber: 3,
    },
    source: 'Company website',
    appliedAt: '2026-10-11',
    archivedAt: null,
    createdAt: '2026-10-11T09:00:00.000Z',
    updatedAt: '2026-10-11T09:00:00.000Z',
    ...overrides,
  };
}

export function applicationDetail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...applicationSummary(),
    applicationUrl: null,
    rejectionReason: null,
    job: {
      id: 'j1',
      title: 'Frontend Developer',
      companyName: 'Example Corp',
      location: 'Chennai',
      jobUrl: null,
      status: 'ACTIVE',
    },
    resumeUsed: {
      resumeId: 'r2',
      resumeName: 'Full Stack Resume',
      resumeVersionId: 'v2',
      versionNumber: 2,
      versionCreatedAt: '2026-10-05T09:00:00.000Z',
      hasFile: true,
      newerVersionExists: false,
    },
    resume: {
      resumeId: 'r2',
      resumeName: 'Full Stack Resume',
      resumeVersionId: 'v2',
      versionNumber: 2,
    },
    recommendedAtCreation: {
      resumeVersionId: 'v1',
      resumeName: 'Angular Resume',
      versionNumber: 3,
      score: 86,
    },
    matchScoreAtCreation: 81,
    allowedNextStatuses: [
      'RECRUITER_SCREEN',
      'ASSESSMENT',
      'INTERVIEW',
      'OFFER',
      'REJECTED',
      'WITHDRAWN',
      'NO_RESPONSE',
    ],
    importantDates: {
      createdAt: '2026-10-11T09:00:00.000Z',
      appliedAt: '2026-10-11',
      firstInterviewAt: null,
      offerAt: null,
      closedAt: null,
      lastUpdatedAt: '2026-10-11T09:00:00.000Z',
    },
    ...overrides,
  };
}

export const timelineEvents: ApplicationTimelineEvent[] = [
  {
    kind: 'NOTE',
    at: '2026-10-12T10:00:00.000Z',
    noteId: 'n1',
    body: 'Recruiter contacted me on LinkedIn.',
    edited: false,
  },
  {
    kind: 'STATUS_CHANGED',
    at: '2026-10-11T10:00:00.000Z',
    fromStatus: 'SAVED',
    toStatus: 'APPLIED',
    note: 'Submitted through company website',
  },
  {
    kind: 'CREATED',
    at: '2026-10-11T09:00:00.000Z',
    status: 'SAVED',
    resumeName: 'Full Stack Resume',
    versionNumber: 2,
  },
];
