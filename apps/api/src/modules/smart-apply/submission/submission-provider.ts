/**
 * Submission integrations (ADR-0020). An integration may only exist where the employer or job
 * provider explicitly permits automated submission and has authorised this app (e.g. an API
 * key issued by the employer for this purpose). Each one declares what it does, what it
 * needs and how its responses are to be read. Browser automation, credential reuse and
 * anti-bot circumvention are never acceptable implementations.
 *
 * No integration ships today: every job source in this app is discovery-only, so
 * applications are prepared and handed off to the official site.
 */

export interface SubmissionCapabilities {
  operation: 'SUBMIT_APPLICATION';
  /** How the integration is authorised, e.g. "API key issued by the employer". */
  authorization: string;
  /** What the user consents to before the first submission. */
  consent: string;
  /** Provider or employer restrictions this integration honours. */
  restrictions: string[];
  /** Fields the provider requires. */
  requiredFields: ('contact' | 'resume' | 'coverLetter' | 'answers')[];
  /** What a successful response means, e.g. "201 with an application id = received". */
  confirmation: string;
  /** Retry policy: only failures the provider states were not accepted are retried. */
  retry: { maxAttempts: number; retryableHttpStatuses: number[] };
}

/** The job, as the integration needs to identify it. */
export interface SubmissionTarget {
  sourceKey: string | null;
  sourceJobId: string | null;
  jobUrl: string | null;
}

export interface SubmissionRequest {
  /** Sent with every attempt for this application; the provider must de-duplicate on it. */
  idempotencyKey: string;
  target: SubmissionTarget;
  applicant: { fullName: string; email: string; phone: string | null };
  resumeVersionId: string;
  /** Loads the resume file only when the integration needs it (no copies are kept). */
  loadResumeFile: () => Promise<{ fileName: string; mimeType: string; bytes: Buffer } | null>;
  coverLetter: string | null;
  answers: { externalKey: string | null; question: string; answer: string }[];
}

export type SubmissionResult =
  /** The provider accepted it. `reference` is the provider's id, or null if it gives none. */
  | { kind: 'CONFIRMED'; reference: string | null; httpStatus?: number }
  /** The provider states it was NOT accepted. */
  | { kind: 'REJECTED'; retryable: boolean; message: string; httpStatus?: number }
  /** It may or may not have been accepted (timeout, connection lost after sending, 5xx…). */
  | { kind: 'AMBIGUOUS'; message: string; httpStatus?: number };

export type ReconcileResult =
  { kind: 'CONFIRMED'; reference: string | null } | { kind: 'NOT_SUBMITTED' } | { kind: 'UNKNOWN' };

export abstract class SubmissionProvider {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly capabilities: SubmissionCapabilities;

  /** Whether this employer/provider authorises submission of this job through this integration. */
  abstract supports(target: SubmissionTarget): boolean;

  abstract submit(request: SubmissionRequest, signal: AbortSignal): Promise<SubmissionResult>;

  /** Looks up the outcome of an earlier ambiguous attempt by its idempotency key. */
  abstract reconcile(
    idempotencyKey: string,
    target: SubmissionTarget,
    signal: AbortSignal,
  ): Promise<ReconcileResult>;
}

/** DI token: the integrations available on this server (empty in production today). */
export const SUBMISSION_PROVIDERS = Symbol('SUBMISSION_PROVIDERS');

/**
 * Why a job from a discovery source can't be submitted automatically. These sources list
 * jobs; their application APIs (where any exist) need the employer's own credentials.
 */
const DISCOVERY_ONLY: Record<string, string> = {
  greenhouse:
    'Greenhouse is used here for discovery only: submitting through Greenhouse needs an API key issued by the employer, which this app does not have.',
  lever:
    'Lever is used here for discovery only: submitting through Lever needs an API key issued by the employer, which this app does not have.',
  adzuna:
    'Adzuna lists jobs; applications are made on the employer’s or Adzuna’s site, and no submission API is offered.',
  remotive: 'Remotive lists jobs; applications are made on the employer’s site.',
  dev: 'Development sample jobs can’t be applied to.',
};

export function discoveryOnlyReason(sourceKey: string | null): string {
  return (
    (sourceKey && DISCOVERY_ONLY[sourceKey]) ||
    'No authorised submission integration exists for this job.'
  );
}
