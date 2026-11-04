import type {
  ActivityAnswer,
  MentorAskRequest,
  UpdateLearningPreferencesRequest,
  InterviewPracticeQuery,
  JobReadinessRequest,
  UpdateProjectProgressRequest,
  CourseCatalogueQuery,
  CourseProgress,
  LearningRecommendationRequest,
  SubmitDiagnosticRequest,
} from '@job-assist/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '../services/learn-api';

export const learnKeys = {
  all: ['learn'] as const,
  catalogue: (query: CourseCatalogueQuery) => ['learn', 'catalogue', query] as const,
  course: (courseId: string) => ['learn', 'course', courseId] as const,
  skills: ['learn', 'skills'] as const,
  roles: ['learn', 'roles'] as const,
  diagnostic: (courseId: string) => ['learn', 'diagnostic', courseId] as const,
  /** Per-user state: invalidated after every recorded change. */
  progressAll: ['learn', 'progress'] as const,
  progress: (courseId: string) => ['learn', 'progress', courseId] as const,
  dashboard: ['learn', 'progress', 'dashboard'] as const,
  interviewQuestions: (query: InterviewPracticeQuery) =>
    ['learn', 'progress', 'interview', 'list', query] as const,
  interviewQuestion: (questionId: string) =>
    ['learn', 'progress', 'interview', 'question', questionId] as const,
  projects: (courseId?: string) =>
    ['learn', 'progress', 'projects', 'list', courseId ?? ''] as const,
  project: (challengeId: string) =>
    ['learn', 'progress', 'projects', 'detail', challengeId] as const,
  analysedJobs: ['learn', 'jobs'] as const,
  nextSteps: ['learn', 'progress', 'next-steps'] as const,
  revision: ['learn', 'progress', 'revision'] as const,
  preferences: ['learn', 'progress', 'preferences'] as const,
};

/** Catalogue content is static, so it is cached for the session. */
const STATIC = 30 * 60 * 1000;

export function useCourseCatalogue(query: CourseCatalogueQuery) {
  return useQuery({
    queryKey: learnKeys.catalogue(query),
    queryFn: () => learnApi.courses(query),
    placeholderData: keepPreviousData,
    staleTime: STATIC,
  });
}

export function useCourse(courseId: string) {
  return useQuery({
    queryKey: learnKeys.course(courseId),
    queryFn: () => learnApi.course(courseId),
    staleTime: STATIC,
  });
}

export function useLearningSkills() {
  return useQuery({ queryKey: learnKeys.skills, queryFn: learnApi.skills, staleTime: STATIC });
}

export function useLearningRoles() {
  return useQuery({ queryKey: learnKeys.roles, queryFn: learnApi.roles, staleTime: STATIC });
}

export function useDiagnostic(courseId: string) {
  return useQuery({
    queryKey: learnKeys.diagnostic(courseId),
    queryFn: () => learnApi.diagnostic(courseId),
    staleTime: STATIC,
  });
}

export function useCourseProgress(courseId: string, enabled = true) {
  return useQuery({
    queryKey: learnKeys.progress(courseId),
    queryFn: () => learnApi.progress(courseId),
    enabled,
  });
}

export function useLearningDashboard() {
  return useQuery({ queryKey: learnKeys.dashboard, queryFn: learnApi.dashboard });
}

/** After any recorded change: store the fresh course progress and refresh the rest. */
function useProgressUpdate() {
  const client = useQueryClient();
  return async (courseId: string, progress?: CourseProgress) => {
    if (progress) client.setQueryData(learnKeys.progress(courseId), progress);
    await client.invalidateQueries({ queryKey: learnKeys.progressAll });
  };
}

export function useEnrollment(courseId: string) {
  const update = useProgressUpdate();
  const enroll = useMutation({
    mutationFn: () => learnApi.enroll(courseId),
    onSuccess: (progress) => update(courseId, progress),
  });
  const unenroll = useMutation({
    mutationFn: () => learnApi.unenroll(courseId),
    onSuccess: () => update(courseId),
  });
  return { enroll, unenroll };
}

export function useLessonCompletion(courseId: string, lessonId: string) {
  const update = useProgressUpdate();
  return useMutation({
    mutationFn: (complete: boolean) => learnApi.setLessonComplete(courseId, lessonId, complete),
    onSuccess: (progress) => update(courseId, progress),
  });
}

export function useSubmitActivity(courseId: string, activityId: string) {
  const update = useProgressUpdate();
  return useMutation({
    mutationFn: (answer: ActivityAnswer) => learnApi.submitActivity(courseId, activityId, answer),
    onSuccess: () => update(courseId),
  });
}

export function useSubmitDiagnostic(courseId: string) {
  const update = useProgressUpdate();
  return useMutation({
    mutationFn: (body: SubmitDiagnosticRequest) => learnApi.submitDiagnostic(courseId, body),
    onSuccess: () => update(courseId),
  });
}

export function useLearningRecommendations() {
  return useMutation({
    mutationFn: (body: LearningRecommendationRequest) => learnApi.recommend(body),
  });
}

export function useInterviewQuestions(query: InterviewPracticeQuery) {
  return useQuery({
    queryKey: learnKeys.interviewQuestions(query),
    queryFn: () => learnApi.interviewQuestions(query),
    placeholderData: keepPreviousData,
  });
}

export function useInterviewQuestion(questionId: string) {
  return useQuery({
    queryKey: learnKeys.interviewQuestion(questionId),
    queryFn: () => learnApi.interviewQuestion(questionId),
  });
}

export function useSubmitInterviewAnswer(questionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answer: string) => learnApi.submitInterviewAnswer(questionId, answer),
    onSuccess: () => client.invalidateQueries({ queryKey: learnKeys.progressAll }),
  });
}

export function useProjectChallenges(courseId?: string) {
  return useQuery({
    queryKey: learnKeys.projects(courseId),
    queryFn: () => learnApi.projects(courseId),
  });
}

export function useProjectChallenge(challengeId: string) {
  return useQuery({
    queryKey: learnKeys.project(challengeId),
    queryFn: () => learnApi.project(challengeId),
  });
}

export function useUpdateProjectProgress(challengeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProjectProgressRequest) => learnApi.updateProject(challengeId, body),
    onSuccess: async (detail) => {
      client.setQueryData(learnKeys.project(challengeId), detail);
      await client.invalidateQueries({ queryKey: learnKeys.progressAll });
    },
  });
}

export function useAnalysedJobs() {
  return useQuery({ queryKey: learnKeys.analysedJobs, queryFn: learnApi.analysedJobs });
}

export function useJobReadiness() {
  return useMutation({ mutationFn: (body: JobReadinessRequest) => learnApi.jobReadiness(body) });
}

export function useNextSteps() {
  return useQuery({ queryKey: learnKeys.nextSteps, queryFn: learnApi.nextSteps });
}

export function useRevisionQueue() {
  return useQuery({ queryKey: learnKeys.revision, queryFn: learnApi.revision });
}

export function useLearningPreferences() {
  return useQuery({ queryKey: learnKeys.preferences, queryFn: learnApi.preferences });
}

/** Preferences, dismissals and restores all change suggestions, so refresh per-user data. */
function usePreferenceMutation<T>(fn: (arg: T) => ReturnType<typeof learnApi.preferences>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (prefs) => {
      client.setQueryData(learnKeys.preferences, prefs);
      await client.invalidateQueries({ queryKey: learnKeys.progressAll });
    },
  });
}

export function useUpdatePreferences() {
  return usePreferenceMutation((body: UpdateLearningPreferencesRequest) =>
    learnApi.updatePreferences(body),
  );
}

export function useDismissNextStep() {
  return usePreferenceMutation((key: string) => learnApi.dismissNextStep(key));
}

export function useRestoreNextSteps() {
  return usePreferenceMutation((_: void) => learnApi.restoreNextSteps());
}

/** Stateless: each question is a separate request; nothing is cached or stored. */
export function useMentorAsk() {
  return useMutation({ mutationFn: (body: MentorAskRequest) => learnApi.mentorAsk(body) });
}
