import type { CareerProfile, MatchEvidence, ResumeContent } from '@job-assist/shared';
import type { MatchRequirement } from '../jobs/matching/match-scorer.js';
import type { VerifiedFacts } from './grounding.js';

/** Everything a generation may use — all of it the signed-in user's own data. */
export interface PreparationContext {
  userId: string;
  applicationId: string;
  candidateName: string;
  job: {
    id: string;
    title: string;
    companyName: string;
    description: string;
    requirements: MatchRequirement[];
    keywords: string[];
  };
  resume: {
    resumeId: string;
    resumeName: string;
    resumeVersionId: string;
    versionNumber: number;
    content: ResumeContent;
  };
  profile: CareerProfile;
  /** Deterministic comparison of this exact version against the job. */
  match: { score: number; strengths: string[]; gaps: string[]; evidence: MatchEvidence };
  facts: VerifiedFacts;
}
