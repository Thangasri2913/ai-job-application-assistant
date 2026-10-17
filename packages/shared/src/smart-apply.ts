import type { ApplicationStatus } from './applications.js';
import type { QuestionType } from './preparation.js';
import type { ResumeContent } from './resumes.js';

// ─── Smart Apply (ADR-0020) ──────────────────────────────────────────────────
//
// The submission workflow of one application, alongside the tracking pipeline
// (ApplicationStatus). Hybrid policy: an application is submitted automatically only through
// an integration the employer/provider explicitly authorises; otherwise it is prepared and the
// user submits it on the official site. Nothing is reported as submitted without either a
// provider confirmation or the user's own report (labelled as such).

export const SMART_APPLY_STATES = [
  'DISCOVERED',
  'PREPARING',
  'NEEDS_USER_INPUT',
  'READY_FOR_REVIEW',
  'AWAITING_USER_SUBMISSION',
  'SUBMITTING',
  'SUBMITTED',
  'FAILED',
  'CANCELLED',
] as const;
export type SmartApplyState = (typeof SMART_APPLY_STATES)[number];

export const SMART_APPLY_STATE_LABELS: Record<SmartApplyState, string> = {
  DISCOVERED: 'Discovered',
  PREPARING: 'Preparing',
  NEEDS_USER_INPUT: 'Needs your input',
  READY_FOR_REVIEW: 'Ready for your review',
  AWAITING_USER_SUBMISSION: 'Submit on the official site',
  SUBMITTING: 'Submitting',
  SUBMITTED: 'Submitted',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

/**
 * Legal moves. Anything else is refused (409). SUBMITTING → SUBMITTED happens only on a
 * provider confirmation; AWAITING_USER_SUBMISSION → SUBMITTED only on the user's explicit
 * report. A cancelled application can be prepared again.
 */
export const SMART_APPLY_TRANSITIONS: Record<SmartApplyState, readonly SmartApplyState[]> = {
  DISCOVERED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['NEEDS_USER_INPUT', 'READY_FOR_REVIEW', 'FAILED', 'CANCELLED'],
  NEEDS_USER_INPUT: ['PREPARING', 'READY_FOR_REVIEW', 'CANCELLED'],
  READY_FOR_REVIEW: [
    'PREPARING',
    'NEEDS_USER_INPUT',
    'AWAITING_USER_SUBMISSION',
    'SUBMITTING',
    'CANCELLED',
  ],
  // An answer changed after approval sends it back for review.
  AWAITING_USER_SUBMISSION: [
    'PREPARING',
    'NEEDS_USER_INPUT',
    'READY_FOR_REVIEW',
    'SUBMITTED',
    'CANCELLED',
  ],
  // Ambiguous outcomes stay SUBMITTING until reconciled; the user may also report it.
  SUBMITTING: ['SUBMITTED', 'FAILED', 'AWAITING_USER_SUBMISSION'],
  SUBMITTED: [],
  FAILED: ['PREPARING', 'AWAITING_USER_SUBMISSION', 'CANCELLED'],
  CANCELLED: ['PREPARING'],
};

export function canTransition(from: SmartApplyState, to: SmartApplyState): boolean {
  return SMART_APPLY_TRANSITIONS[from].includes(to);
}

/** States in which the user may cancel (before anything was sent). */
export const CANCELLABLE_STATES: readonly SmartApplyState[] = SMART_APPLY_STATES.filter((s) =>
  SMART_APPLY_TRANSITIONS[s].includes('CANCELLED'),
);

export const SUBMISSION_METHODS = ['PROVIDER_INTEGRATION', 'USER_HANDOFF'] as const;
export type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];

/**
 * PROVIDER_CONFIRMED: the integration returned a successful response. USER_REPORTED: the
 * user said they submitted it on the official site — not verified by the app.
 */
export const SUBMISSION_CONFIRMATIONS = ['PROVIDER_CONFIRMED', 'USER_REPORTED'] as const;
export type SubmissionConfirmation = (typeof SUBMISSION_CONFIRMATIONS)[number];

export const SUBMISSION_CONFIRMATION_LABELS: Record<SubmissionConfirmation, string> = {
  PROVIDER_CONFIRMED: 'Confirmed by the provider',
  USER_REPORTED: 'Reported by you (not verified)',
};

export const SUBMISSION_ATTEMPT_OUTCOMES = [
  'PENDING',
  'CONFIRMED',
  'RETRYABLE_FAILURE',
  'PERMANENT_FAILURE',
  'AMBIGUOUS',
] as const;
export type SubmissionAttemptOutcome = (typeof SUBMISSION_ATTEMPT_OUTCOMES)[number];

/** PREPARE_ONLY never submits automatically. HYBRID may use authorised integrations. */
export const SMART_APPLY_MODES = ['PREPARE_ONLY', 'HYBRID'] as const;
export type SmartApplyMode = (typeof SMART_APPLY_MODES)[number];

export const SMART_APPLY_MODE_LABELS: Record<SmartApplyMode, string> = {
  PREPARE_ONLY: 'Prepare only — I always submit myself',
  HYBRID: 'Hybrid — submit automatically only where the employer authorises it',
};

/** Bump when the consent wording changes: earlier consent then no longer covers submission. */
export const AUTO_SUBMIT_CONSENT_VERSION = 'auto-submit@1';
export const AUTO_SUBMIT_CONSENT_TEXT =
  'I allow the app to submit applications I have approved, one at a time, only through integrations the employer or job provider has authorised, within my daily limit. I can withdraw this consent at any time.';

export const DAILY_APPLICATION_LIMIT_MAX = 50;
export const DAILY_SUBMISSION_LIMIT_MAX = 20;

/** Where an application URL came from. The app never claims to have verified it further. */
export const APPLICATION_URL_KINDS = ['EMPLOYER_POSTING', 'LISTING_PAGE', 'USER_PROVIDED'] as const;
export type ApplicationUrlKind = (typeof APPLICATION_URL_KINDS)[number];

export const APPLICATION_URL_KIND_LABELS: Record<ApplicationUrlKind, string> = {
  EMPLOYER_POSTING: 'The employer’s own job posting',
  LISTING_PAGE: 'A job listing page; the employer’s application is linked from there',
  USER_PROVIDED: 'A link you added',
};

// ─── Answers ────────────────────────────────────────────────────────────────

/**
 * STANDARD answers may be reused once confirmed. SENSITIVE ones (work authorisation, salary,
 * legal declarations and attestations) are pre-filled but must be confirmed for each
 * application. DEMOGRAPHIC answers are never saved or reused.
 */
export const ANSWER_SENSITIVITIES = ['STANDARD', 'SENSITIVE', 'DEMOGRAPHIC'] as const;
export type AnswerSensitivity = (typeof ANSWER_SENSITIVITIES)[number];

export const SMART_ANSWER_MAX_LENGTH = 5000;

export interface SmartApplyQuestion {
  id: string;
  applicationId: string;
  smartApplicationId: string;
  question: string;
  questionType: QuestionType;
  required: boolean;
  sensitivity: AnswerSensitivity;
  /** Choices the employer offers, if any (the answer must be one of them). */
  options: string[];
  /** Where the question came from, e.g. "Greenhouse application form" or "Added by you". */
  origin: string;
  answer: string | null;
  /** The answer was confirmed by the user (or reused from a confirmed saved answer). */
  confirmed: boolean;
  /** Pre-filled from a saved answer or the profile: shown for confirmation. */
  prefilledFrom: 'SAVED_ANSWER' | 'PROFILE' | null;
  /** Why this information is needed (never a guess at the answer). */
  reason: string;
  job: { title: string; companyName: string };
}

export interface AnswerQuestionRequest {
  answer: string;
  /** Required to confirm the answer; sensitive answers can only be confirmed explicitly. */
  confirm: boolean;
  /** Save for reuse in later applications (not allowed for demographic answers). */
  saveForReuse?: boolean;
}

export interface ProfileAnswerItem {
  id: string;
  answerKey: string;
  questionType: QuestionType;
  /** The question it was given for. */
  label: string;
  answer: string;
  sensitivity: AnswerSensitivity;
  confirmedAt: string;
  /** After this, it is no longer reused without confirming it again. */
  validUntil: string | null;
}

// ─── Eligibility ────────────────────────────────────────────────────────────

export interface EligibilityCheck {
  code:
    | 'PROVIDER_INTEGRATION'
    | 'AUTO_SUBMIT_ENABLED'
    | 'MODE'
    | 'CONSENT'
    | 'DAILY_LIMIT'
    | 'ANSWERS_COMPLETE'
    | 'APPROVED';
  satisfied: boolean;
  message: string;
}

export interface SubmissionEligibility {
  /** True only when every check passes. */
  autoSubmitEligible: boolean;
  method: SubmissionMethod;
  providerKey: string | null;
  checks: EligibilityCheck[];
  /** One sentence for the UI. */
  summary: string;
}

// ─── Responses ──────────────────────────────────────────────────────────────

export interface SmartApplyEventItem {
  id: string;
  fromState: SmartApplyState | null;
  toState: SmartApplyState;
  actor: 'USER' | 'SYSTEM';
  reason: string | null;
  createdAt: string;
}

export interface SubmissionAttemptItem {
  id: string;
  attemptNumber: number;
  providerKey: string;
  outcome: SubmissionAttemptOutcome;
  /** Provider's reference for a confirmed submission; never invented. */
  providerReference: string | null;
  /** Safe, user-facing message. */
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
  nextAttemptAt: string | null;
}

export interface SmartApplicationSummary {
  id: string;
  applicationId: string;
  state: SmartApplyState;
  trackerStatus: ApplicationStatus;
  job: {
    id: string;
    title: string;
    companyName: string;
    location: string | null;
    source: string | null;
  };
  matchScore: number | null;
  outstandingQuestions: number;
  submissionMethod: SubmissionMethod | null;
  confirmation: SubmissionConfirmation | null;
  /** The last submission attempt's outcome was ambiguous: waiting for reconciliation. */
  uncertain: boolean;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SmartApplicationDetail extends SmartApplicationSummary {
  officialApplicationUrl: string | null;
  applicationUrlKind: ApplicationUrlKind | null;
  matchExplanation: string | null;
  resume: { resumeId: string; resumeName: string; resumeVersionId: string; versionNumber: number };
  coverLetter: { versionNumber: number; status: string; text: string } | null;
  questions: SmartApplyQuestion[];
  eligibility: SubmissionEligibility;
  confirmationReference: string | null;
  approvedAt: string | null;
  preparedAt: string | null;
  submittedAt: string | null;
  history: SmartApplyEventItem[];
  attempts: SubmissionAttemptItem[];
}

/** Everything prepared for one application, for review before submitting. */
export interface SmartApplicationMaterials {
  smartApplicationId: string;
  resume: {
    resumeId: string;
    resumeName: string;
    resumeVersionId: string;
    versionNumber: number;
    content: ResumeContent | null;
  };
  coverLetter: { versionNumber: number; status: string; text: string } | null;
  answers: { question: string; answer: string | null; confirmed: boolean; required: boolean }[];
  officialApplicationUrl: string | null;
}

export interface SmartApplicationListResponse {
  items: SmartApplicationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SmartApplySettingsItem {
  mode: SmartApplyMode;
  dailyApplicationLimit: number;
  dailySubmissionLimit: number;
  /** Consent to automatic submission (current wording only), or null. */
  autoSubmitConsentAt: string | null;
  consentText: string;
  consentVersion: string;
  /** Whether this server allows automatic submission at all. */
  autoSubmitAvailable: boolean;
  /** Submission integrations available on this server (may be empty). */
  providers: { key: string; name: string }[];
  usage: { applicationsToday: number; submissionsToday: number };
}

export interface UpdateSmartApplySettingsRequest {
  mode?: SmartApplyMode;
  dailyApplicationLimit?: number;
  dailySubmissionLimit?: number;
  /** true records consent to the current wording; false withdraws it. */
  autoSubmitConsent?: boolean;
}

export interface PrepareSmartApplicationRequest {
  jobId: string;
  /** Defaults to the job's recommended resume version. */
  resumeVersionId?: string;
}

export interface ManualSubmissionRequest {
  /** The user confirms they submitted it themselves on the official site. */
  confirm: true;
  /** "YYYY-MM-DD"; defaults to today. */
  submittedOn?: string;
  note?: string;
}

// ─── Notifications (contract only; delivery channels are future work) ───────

export const SMART_APPLY_NOTIFICATION_EVENTS = [
  'QUESTIONS_NEED_ANSWERS',
  'READY_FOR_REVIEW',
  'SUBMISSION_CONFIRMED',
  'SUBMISSION_FAILED',
  'SUBMISSION_UNCERTAIN',
] as const;
export type SmartApplyNotificationEvent = (typeof SMART_APPLY_NOTIFICATION_EVENTS)[number];

/** Payload a push/in-app notification carries: ids only, never answers or personal data. */
export interface SmartApplyNotificationPayload {
  event: SmartApplyNotificationEvent;
  smartApplicationId: string;
  /** App route, e.g. "/smart-apply/<id>". */
  link: string;
}

// ─── Display (shared by web and mobile) ─────────────────────────────────────

export type SmartApplyDisplayKind =
  | 'PREPARING'
  | 'NEEDS_INPUT'
  | 'AWAITING_REVIEW'
  | 'AWAITING_USER_SUBMISSION'
  | 'SUBMITTING'
  | 'UNCERTAIN'
  | 'PROVIDER_CONFIRMED'
  | 'USER_REPORTED'
  | 'FAILED'
  | 'CANCELLED';

export interface SmartApplyDisplay {
  kind: SmartApplyDisplayKind;
  label: string;
  tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  /** One sentence telling the user what this means / what to do next. */
  hint: string;
}

/**
 * How an application's status is shown. Only a provider confirmation is shown as success;
 * a submission the user reported is labelled as theirs, never as confirmed.
 */
export function smartApplyDisplay(a: {
  state: SmartApplyState;
  confirmation: SubmissionConfirmation | null;
  uncertain: boolean;
}): SmartApplyDisplay {
  switch (a.state) {
    case 'DISCOVERED':
    case 'PREPARING':
      return {
        kind: 'PREPARING',
        label: 'Preparing…',
        tone: 'primary',
        hint: 'The app is preparing your materials.',
      };
    case 'NEEDS_USER_INPUT':
      return {
        kind: 'NEEDS_INPUT',
        label: 'Needs your answers',
        tone: 'warning',
        hint: 'Answer the required questions so the application can be reviewed.',
      };
    case 'READY_FOR_REVIEW':
      return {
        kind: 'AWAITING_REVIEW',
        label: 'AI-prepared · awaiting your review',
        tone: 'primary',
        hint: 'Review the resume, cover letter and answers, then approve.',
      };
    case 'AWAITING_USER_SUBMISSION':
      return {
        kind: 'AWAITING_USER_SUBMISSION',
        label: 'Submit on the official site',
        tone: 'warning',
        hint: 'Open the official application page, submit it there, then tell us you did.',
      };
    case 'SUBMITTING':
      return a.uncertain
        ? {
            kind: 'UNCERTAIN',
            label: 'Submission uncertain',
            tone: 'danger',
            hint: 'We could not confirm whether it was received and are checking. Don’t resubmit yet.',
          }
        : {
            kind: 'SUBMITTING',
            label: 'Submitting…',
            tone: 'primary',
            hint: 'Waiting for the provider’s response.',
          };
    case 'SUBMITTED':
      return a.confirmation === 'PROVIDER_CONFIRMED'
        ? {
            kind: 'PROVIDER_CONFIRMED',
            label: 'Submitted · confirmed by provider',
            tone: 'success',
            hint: 'The provider confirmed it received your application.',
          }
        : {
            kind: 'USER_REPORTED',
            label: 'Submitted · reported by you',
            tone: 'neutral',
            hint: 'You told us you submitted it on the official site; the app has not verified this.',
          };
    case 'FAILED':
      return {
        kind: 'FAILED',
        label: 'Not submitted',
        tone: 'danger',
        hint: 'Something went wrong. You can prepare it again or submit on the official site.',
      };
    case 'CANCELLED':
      return {
        kind: 'CANCELLED',
        label: 'Cancelled',
        tone: 'neutral',
        hint: 'Cancelled before submission.',
      };
  }
}
