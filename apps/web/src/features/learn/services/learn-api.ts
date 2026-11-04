import type {
  ActivityAnswer,
  MentorAskRequest,
  MentorResponse,
  LearningPreferences,
  NextStepsResponse,
  RevisionQueueResponse,
  UpdateLearningPreferencesRequest,
  AnalysedJobsResponse,
  InterviewFeedback,
  InterviewPracticeQuery,
  InterviewPracticeQuestionsResponse,
  InterviewQuestionDetail,
  JobReadinessRequest,
  JobReadinessResponse,
  ProjectChallengeDetail,
  ProjectChallengesResponse,
  UpdateProjectProgressRequest,
  ActivityAttemptResult,
  CourseCatalogueQuery,
  CourseCatalogueResponse,
  CourseDetail,
  CourseProgress,
  DiagnosticAssessment,
  DiagnosticResult,
  LearningDashboard,
  LearningRecommendationRequest,
  LearningRecommendationResponse,
  LearningRolesResponse,
  LearningSkillsResponse,
  SubmitDiagnosticRequest,
} from '@job-assist/shared';
import { apiRequest } from '../../../lib/api/http';

/** "?q=…&category=…" with only the filters that are set (empty for none). */
export function catalogueQueryString(query: CourseCatalogueQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.category) params.set('category', query.category);
  if (query.skill) params.set('skill', query.skill);
  if (query.role) params.set('role', query.role);
  if (query.difficulty) params.set('difficulty', query.difficulty);
  if (query.status) params.set('status', query.status);
  const search = params.toString();
  return search ? `?${search}` : '';
}

function interviewQueryString(query: InterviewPracticeQuery): string {
  const params = new URLSearchParams();
  if (query.role) params.set('role', query.role);
  if (query.skill) params.set('skill', query.skill);
  if (query.courseId) params.set('courseId', query.courseId);
  if (query.difficulty) params.set('difficulty', query.difficulty);
  const search = params.toString();
  return search ? `?${search}` : '';
}

const course = (courseId: string) => `/learning/courses/${encodeURIComponent(courseId)}`;

export const learnApi = {
  courses: (query: CourseCatalogueQuery) =>
    apiRequest<CourseCatalogueResponse>(`/learning/courses${catalogueQueryString(query)}`),
  course: (courseId: string) => apiRequest<CourseDetail>(course(courseId)),
  skills: () => apiRequest<LearningSkillsResponse>('/learning/skills'),
  roles: () => apiRequest<LearningRolesResponse>('/learning/roles'),
  diagnostic: (courseId: string) =>
    apiRequest<DiagnosticAssessment>(`${course(courseId)}/diagnostic`),
  submitDiagnostic: (courseId: string, body: SubmitDiagnosticRequest) =>
    apiRequest<DiagnosticResult>(`${course(courseId)}/diagnostic/attempts`, {
      method: 'POST',
      body,
    }),
  dashboard: () => apiRequest<LearningDashboard>('/learning/dashboard'),
  progress: (courseId: string) => apiRequest<CourseProgress>(`${course(courseId)}/progress`),
  enroll: (courseId: string) =>
    apiRequest<CourseProgress>(`/learning/enrollments/${encodeURIComponent(courseId)}`, {
      method: 'PUT',
    }),
  unenroll: (courseId: string) =>
    apiRequest<void>(`/learning/enrollments/${encodeURIComponent(courseId)}`, { method: 'DELETE' }),
  setLessonComplete: (courseId: string, lessonId: string, complete: boolean) =>
    apiRequest<CourseProgress>(
      `${course(courseId)}/lessons/${encodeURIComponent(lessonId)}/completion`,
      { method: complete ? 'PUT' : 'DELETE' },
    ),
  submitActivity: (courseId: string, activityId: string, answer: ActivityAnswer) =>
    apiRequest<ActivityAttemptResult>(
      `${course(courseId)}/activities/${encodeURIComponent(activityId)}/attempts`,
      { method: 'POST', body: { answer } },
    ),
  recommend: (body: LearningRecommendationRequest) =>
    apiRequest<LearningRecommendationResponse>('/learning/recommendations', {
      method: 'POST',
      body,
    }),
  interviewQuestions: (query: InterviewPracticeQuery) =>
    apiRequest<InterviewPracticeQuestionsResponse>(
      `/learning/interview/questions${interviewQueryString(query)}`,
    ),
  interviewQuestion: (questionId: string) =>
    apiRequest<InterviewQuestionDetail>(
      `/learning/interview/questions/${encodeURIComponent(questionId)}`,
    ),
  submitInterviewAnswer: (questionId: string, answer: string) =>
    apiRequest<InterviewFeedback>(
      `/learning/interview/questions/${encodeURIComponent(questionId)}/attempts`,
      { method: 'POST', body: { answer } },
    ),
  projects: (courseId?: string) =>
    apiRequest<ProjectChallengesResponse>(
      `/learning/projects${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`,
    ),
  project: (challengeId: string) =>
    apiRequest<ProjectChallengeDetail>(`/learning/projects/${encodeURIComponent(challengeId)}`),
  updateProject: (challengeId: string, body: UpdateProjectProgressRequest) =>
    apiRequest<ProjectChallengeDetail>(
      `/learning/projects/${encodeURIComponent(challengeId)}/progress`,
      { method: 'PUT', body },
    ),
  analysedJobs: () => apiRequest<AnalysedJobsResponse>('/learning/jobs'),
  jobReadiness: (body: JobReadinessRequest) =>
    apiRequest<JobReadinessResponse>('/learning/job-readiness', { method: 'POST', body }),
  nextSteps: () => apiRequest<NextStepsResponse>('/learning/next-steps'),
  dismissNextStep: (key: string) =>
    apiRequest<LearningPreferences>('/learning/next-steps/dismissals', {
      method: 'POST',
      body: { key },
    }),
  restoreNextSteps: () =>
    apiRequest<LearningPreferences>('/learning/next-steps/dismissals', { method: 'DELETE' }),
  revision: () => apiRequest<RevisionQueueResponse>('/learning/revision'),
  preferences: () => apiRequest<LearningPreferences>('/learning/preferences'),
  updatePreferences: (body: UpdateLearningPreferencesRequest) =>
    apiRequest<LearningPreferences>('/learning/preferences', { method: 'PUT', body }),
  mentorAsk: (body: MentorAskRequest) =>
    apiRequest<MentorResponse>('/mentor/ask', { method: 'POST', body }),
};
