import type {
  AnswerQuestionRequest,
  ApplicationDetail,
  ApplicationSummary,
  ApplicationTimelineEvent,
  AuthUser,
  DashboardSummary,
  JobDetail,
  JobRecommendationItem,
  ManualSubmissionRequest,
  ProfileAnswerItem,
  ResumeSummary,
  SmartApplySettingsItem,
  UpdateSmartApplySettingsRequest,
  WorkMode,
  SmartApplicationDetail,
  SmartApplicationListResponse,
  SmartApplicationMaterials,
  SmartApplyQuestion,
} from '@job-assist/shared';

/** A failed API call with a message that is safe and clear to show the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'unauthorized' | 'http',
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** A valid access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Forces a token refresh after a 401; null means the session has ended. */
  refreshToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Called when the session has ended (the UI returns to sign-in). */
  onUnauthorized?: () => void;
}

export interface RecommendationQuery {
  status?: 'ACTIVE' | 'NEW' | 'SAVED';
  minScore?: number;
  workMode?: WorkMode;
  title?: string;
}

export const OFFLINE_MESSAGE =
  'You appear to be offline or the server can’t be reached. Check your connection and try again.';

/** The offline message, naming the server it tried (an address, never credentials). */
export function offlineMessage(baseUrl: string): string {
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    // keep the raw value
  }
  return `${OFFLINE_MESSAGE} (Tried ${host}.)`;
}
export const SESSION_EXPIRED_MESSAGE = 'Your session has ended. Please sign in again.';

/** JSON client for the existing NestJS API (same endpoints as the web app). */
export function createApiClient(o: ApiClientOptions) {
  const fetchFn = o.fetchFn ?? fetch;
  const timeoutMs = o.timeoutMs ?? 20_000;

  async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    try {
      return await fetchFn(`${o.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } catch {
      throw new ApiError(offlineMessage(o.baseUrl), 'offline');
    } finally {
      clearTimeout(timer);
    }
  }

  /** The session can't be used any more: tell the app (it returns to sign-in). */
  const ended = () => {
    o.onUnauthorized?.();
    return new ApiError(SESSION_EXPIRED_MESSAGE, 'unauthorized', 401);
  };

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token: string | null;
    try {
      token = await o.getToken();
    } catch {
      throw new ApiError(offlineMessage(o.baseUrl), 'offline');
    }
    if (!token) throw ended();
    let response = await send(path, init, token);
    if (response.status === 401) {
      // The token may have been revoked or expired early: renew once, then give up.
      let renewed: string | null;
      try {
        renewed = await o.refreshToken();
      } catch {
        throw new ApiError(offlineMessage(o.baseUrl), 'offline');
      }
      if (!renewed) throw ended();
      response = await send(path, init, renewed);
      if (response.status === 401) throw ended();
    }
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    if (!response.ok) {
      const message =
        typeof body?.message === 'string' && body.message
          ? body.message
          : `Something went wrong (HTTP ${response.status}). Please try again.`;
      throw new ApiError(message, 'http', response.status);
    }
    return body as T;
  }

  const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(headers ? { headers } : {}),
  });
  const sa = (id: string) => `/smart-apply/applications/${encodeURIComponent(id)}`;

  const rec = (id: string) => `/recommendations/${encodeURIComponent(id)}`;

  return {
    /** The signed-in user (also verifies the API accepts the session). */
    me: () => request<AuthUser>('/auth/me'),
    dashboard: () => request<DashboardSummary>('/dashboard/summary'),
    recommendations: (q: RecommendationQuery = {}) => {
      const params = new URLSearchParams({ status: q.status ?? 'ACTIVE' });
      if (q.minScore) params.set('minScore', String(q.minScore));
      if (q.workMode) params.set('workMode', q.workMode);
      if (q.title?.trim()) params.set('title', q.title.trim());
      return request<JobRecommendationItem[]>(`/recommendations?${params.toString()}`);
    },
    /** Opening a recommendation marks it viewed (as on the web). */
    recommendation: (id: string) => request<JobRecommendationItem>(rec(id)),
    saveRecommendation: (id: string) =>
      request<JobRecommendationItem>(`${rec(id)}/save`, json('POST')),
    dismissRecommendation: (id: string) =>
      request<JobRecommendationItem>(`${rec(id)}/dismiss`, json('POST')),
    job: (id: string) => request<JobDetail>(`/jobs/${encodeURIComponent(id)}`),
    trackedApplications: () => request<ApplicationSummary[]>('/applications?archived=ACTIVE'),
    trackedApplication: (id: string) =>
      request<ApplicationDetail>(`/applications/${encodeURIComponent(id)}`),
    timeline: (id: string) =>
      request<ApplicationTimelineEvent[]>(`/applications/${encodeURIComponent(id)}/timeline`),
    resumes: () => request<ResumeSummary[]>('/resumes?status=ACTIVE'),
    settings: () => request<SmartApplySettingsItem>('/smart-apply/settings'),
    updateSettings: (body: UpdateSmartApplySettingsRequest) =>
      request<SmartApplySettingsItem>('/smart-apply/settings', json('PUT', body)),
    savedAnswers: () => request<ProfileAnswerItem[]>('/smart-apply/saved-answers'),
    deleteSavedAnswer: (id: string) =>
      request<void>(`/smart-apply/saved-answers/${encodeURIComponent(id)}`, json('DELETE')),
    handoff: (id: string) => request<SmartApplicationDetail>(`${sa(id)}/handoff`, json('POST')),
    prepareAgain: (id: string) => request<SmartApplicationDetail>(`${sa(id)}/resume`, json('POST')),
    applications: (page = 1) =>
      request<SmartApplicationListResponse>(`/smart-apply/applications?page=${page}&pageSize=20`),
    application: (id: string) => request<SmartApplicationDetail>(sa(id)),
    materials: (id: string) => request<SmartApplicationMaterials>(`${sa(id)}/materials`),
    prepare: (jobId: string, resumeVersionId?: string | null) =>
      request<SmartApplicationDetail>(
        '/smart-apply/applications',
        json('POST', { jobId, ...(resumeVersionId ? { resumeVersionId } : {}) }),
      ),
    questions: () => request<SmartApplyQuestion[]>('/smart-apply/questions'),
    answer: (id: string, questionId: string, body: AnswerQuestionRequest) =>
      request<SmartApplyQuestion>(
        `${sa(id)}/questions/${encodeURIComponent(questionId)}/answer`,
        json('PUT', body),
      ),
    approve: (id: string) => request<SmartApplicationDetail>(`${sa(id)}/approve`, json('POST')),
    reportSubmitted: (id: string, body: ManualSubmissionRequest) =>
      request<SmartApplicationDetail>(`${sa(id)}/manual-submission`, json('POST', body)),
    cancel: (id: string) => request<SmartApplicationDetail>(`${sa(id)}/cancel`, json('POST')),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
