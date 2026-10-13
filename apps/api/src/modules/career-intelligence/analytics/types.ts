import type {
  ApplicationStatus,
  JobRequirementImportance,
  RejectionCategory,
  SeniorityLevel,
  SkillMatchStatus,
  WorkMode,
} from '@job-assist/shared';

/** One tracked application, as stored (historical snapshots, never recomputed). */
export interface ApplicationRecord {
  id: string;
  status: ApplicationStatus;
  /** Every status the application ever entered (append-only history) plus the current one. */
  reached: ApplicationStatus[];
  appliedAt: Date | null;
  createdAt: Date;
  /** Where the user applied (or the job's source when no application source was recorded). */
  source: string | null;
  jobTitle: string;
  companyName: string;
  location: string | null;
  workMode: WorkMode | null;
  seniority: SeniorityLevel | null;
  resume: ResumeVersionRef;
  /** Compatibility score of the version used, snapshotted when the application was created. */
  matchScore: number | null;
  /** Required skills of the job analysis the snapshot was taken from (canonical names). */
  requiredSkills: string[];
  rejectionCategory: RejectionCategory | null;
}

export interface ResumeVersionRef {
  resumeId: string;
  resumeName: string;
  resumeVersionId: string;
  versionNumber: number;
  isCurrent: boolean;
  resumeArchived: boolean;
}

/** An analysed job the user is targeting, with the best resume's evidence per skill. */
export interface TargetJobRecord {
  jobId: string;
  skills: {
    name: string;
    importance: JobRequirementImportance;
    /** Evidence status in the best-matching resume; null if no resume was compared. */
    status: SkillMatchStatus | null;
  }[];
}

export interface ResumeVersionRecord extends ResumeVersionRef {
  jobsMatched: number;
  averageMatchScore: number | null;
}

export interface InterviewSessionTopics {
  topics: { topic: string; score: number }[];
}

export interface CareerData {
  applications: ApplicationRecord[];
  targetJobs: TargetJobRecord[];
  resumeVersions: ResumeVersionRecord[];
  interviewSessions: InterviewSessionTopics[];
}
