/** Stable machine-readable error codes returned in `ApiErrorResponse.code`. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** Access token expired: the client should refresh it or sign in again. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Keycloak could not be reached to validate the token. */
  IDENTITY_PROVIDER_UNAVAILABLE: 'IDENTITY_PROVIDER_UNAVAILABLE',

  FILE_REQUIRED: 'FILE_REQUIRED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  RESUME_ARCHIVED: 'RESUME_ARCHIVED',
  VERSION_NOT_EDITABLE: 'VERSION_NOT_EDITABLE',
  VERSION_NOT_READY: 'VERSION_NOT_READY',
  /** The same job (title, company and description) was already added; `meta.existingJobId`. */
  DUPLICATE_JOB: 'DUPLICATE_JOB',
  JOB_ARCHIVED: 'JOB_ARCHIVED',
  /** An analysis of this job is already pending or running. */
  ANALYSIS_IN_PROGRESS: 'ANALYSIS_IN_PROGRESS',
  /** The job hasn't been analysed successfully yet. */
  ANALYSIS_NOT_AVAILABLE: 'ANALYSIS_NOT_AVAILABLE',
  /** Only the current version of an active resume can be chosen for a job. */
  RESUME_NOT_SELECTABLE: 'RESUME_NOT_SELECTABLE',
  /** The job already has an active application; `meta.existingApplicationId`. */
  APPLICATION_EXISTS: 'APPLICATION_EXISTS',
  APPLICATION_ARCHIVED: 'APPLICATION_ARCHIVED',
  /** Only archived applications can be deleted permanently. */
  APPLICATION_NOT_ARCHIVED: 'APPLICATION_NOT_ARCHIVED',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  /** The resume was used for applications; archive it instead of deleting. */
  RESUME_IN_USE: 'RESUME_IN_USE',
  /** The job has applications; archive it instead of deleting. */
  JOB_HAS_APPLICATIONS: 'JOB_HAS_APPLICATIONS',
  /** A generation is already running for this application's preparation. */
  AI_GENERATION_IN_PROGRESS: 'AI_GENERATION_IN_PROGRESS',
  /** Something still needs review before the preparation can be approved. */
  PREPARATION_NOT_READY: 'PREPARATION_NOT_READY',
  /** The resume version has no structured content to prepare from. */
  RESUME_CONTENT_MISSING: 'RESUME_CONTENT_MISSING',
  /** There is no answer to approve (the suggestion lacked verified information). */
  ANSWER_REQUIRED: 'ANSWER_REQUIRED',
  /** The interview session is completed or abandoned. */
  INTERVIEW_CLOSED: 'INTERVIEW_CLOSED',
  INTERVIEW_NOT_STARTED: 'INTERVIEW_NOT_STARTED',
  QUESTIONS_NOT_GENERATED: 'QUESTIONS_NOT_GENERATED',
  /** Mock interviews are answered in order, once per question. */
  ANSWER_OUT_OF_ORDER: 'ANSWER_OUT_OF_ORDER',
  ANSWER_EXISTS: 'ANSWER_EXISTS',
  /** Mock interview feedback is given only at the end. */
  EVALUATION_DEFERRED: 'EVALUATION_DEFERRED',
  NO_ANSWERS: 'NO_ANSWERS',
  REPORT_NOT_READY: 'REPORT_NOT_READY',
  /** A search for this alert is already running. */
  JOB_SEARCH_IN_PROGRESS: 'JOB_SEARCH_IN_PROGRESS',
  JOB_ALERT_LIMIT: 'JOB_ALERT_LIMIT',
  /** Career insights are already being generated for this user. */
  INSIGHTS_IN_PROGRESS: 'INSIGHTS_IN_PROGRESS',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.FILE_TOO_LARGE,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};
