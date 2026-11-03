import type { LearningRole, MentorTool } from '@job-assist/shared';
import type { AgentContext, MentorToolPort } from '../types.js';

/**
 * The approved, read-only tools, bound to the trusted user id from the host's authenticated
 * context. Callers (the plan runner) cannot pass a user id, and the model never calls tools.
 */
export interface Toolbox {
  catalogue: MentorToolPort['catalogue'];
  preferences(): ReturnType<MentorToolPort['preferences']>;
  learningSnapshot(): ReturnType<MentorToolPort['learningSnapshot']>;
  skillAssessment(
    target: { role: LearningRole } | { skillIds: string[] },
  ): ReturnType<MentorToolPort['skillAssessment']>;
  learningPlan(role: LearningRole): ReturnType<MentorToolPort['learningPlan']>;
  interviewPractice(): ReturnType<MentorToolPort['interviewPractice']>;
  projectChallenges(): ReturnType<MentorToolPort['projectChallenges']>;
  analysedJobs(): ReturnType<MentorToolPort['analysedJobs']>;
  jobReadiness(jobId: string): ReturnType<MentorToolPort['jobReadiness']>;
}

/** What each approved tool reads. All are read-only; none accepts free text or a query. */
export const APPROVED_TOOLS: Record<MentorTool, string> = {
  catalogue: 'Published courses, skills and role core skills (not user data).',
  preferences: "The user's learning preferences (target role, interests, weekly goal).",
  learning_snapshot: "The user's next steps, revision queue, analytics and enrolments.",
  skill_assessment: "The user's skill evidence for a role or named catalogue skills.",
  learning_plan: "The user's personalised plan for one role.",
  interview_practice: "Interview questions and the user's practice overview.",
  project_challenges: "Project challenges and the user's progress on them.",
  analysed_jobs: "The user's own analysed jobs (title, company, id).",
  job_readiness: "Skill comparison for one of the user's own analysed jobs.",
};

export function createToolbox(port: MentorToolPort, context: AgentContext): Readonly<Toolbox> {
  const { userId } = context;
  return Object.freeze({
    catalogue: () => port.catalogue(),
    preferences: () => port.preferences(userId),
    learningSnapshot: () => port.learningSnapshot(userId),
    skillAssessment: (target) => port.skillAssessment(userId, target),
    learningPlan: (role) => port.learningPlan(userId, role),
    interviewPractice: () => port.interviewPractice(userId),
    projectChallenges: () => port.projectChallenges(userId),
    analysedJobs: () => port.analysedJobs(userId),
    jobReadiness: (jobId) => port.jobReadiness(userId, jobId),
  } satisfies Toolbox);
}
