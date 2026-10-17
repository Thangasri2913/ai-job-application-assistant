import type { EligibilityCheck, SmartApplyMode, SubmissionEligibility } from '@job-assist/shared';

export interface EligibilityInput {
  /** The integration that supports this job, or null with the reason it can't be used. */
  provider: { key: string; name: string } | null;
  providerReason: string;
  autoSubmitEnabled: boolean;
  mode: SmartApplyMode;
  consentValid: boolean;
  submissionsToday: number;
  dailySubmissionLimit: number;
  outstandingQuestions: number;
  approved: boolean;
}

/**
 * Whether an application may be submitted automatically. Every check must pass; otherwise
 * the application is handed off to the official site. Pure, so the API and its tests share it.
 */
export function evaluateEligibility(i: EligibilityInput): SubmissionEligibility {
  const checks: EligibilityCheck[] = [
    {
      code: 'PROVIDER_INTEGRATION',
      satisfied: i.provider !== null,
      message: i.provider
        ? `${i.provider.name} accepts applications through an authorised integration.`
        : i.providerReason,
    },
    {
      code: 'AUTO_SUBMIT_ENABLED',
      satisfied: i.autoSubmitEnabled,
      message: i.autoSubmitEnabled
        ? 'Automatic submission is enabled on this server.'
        : 'Automatic submission is turned off on this server.',
    },
    {
      code: 'MODE',
      satisfied: i.mode === 'HYBRID',
      message:
        i.mode === 'HYBRID'
          ? 'Your Smart Apply mode allows authorised automatic submission.'
          : 'Your Smart Apply mode is “Prepare only”: you always submit yourself.',
    },
    {
      code: 'CONSENT',
      satisfied: i.consentValid,
      message: i.consentValid
        ? 'You have consented to automatic submission.'
        : 'You have not consented to automatic submission (or the consent wording changed).',
    },
    {
      code: 'DAILY_LIMIT',
      satisfied: i.submissionsToday < i.dailySubmissionLimit,
      message: `${i.submissionsToday} of your ${i.dailySubmissionLimit} automatic submissions in the last 24 hours used.`,
    },
    {
      code: 'ANSWERS_COMPLETE',
      satisfied: i.outstandingQuestions === 0,
      message:
        i.outstandingQuestions === 0
          ? 'Every required question has a confirmed answer.'
          : `${i.outstandingQuestions} required question${i.outstandingQuestions === 1 ? '' : 's'} still need${i.outstandingQuestions === 1 ? 's' : ''} your answer.`,
    },
    {
      code: 'APPROVED',
      satisfied: i.approved,
      message: i.approved
        ? 'You approved this application.'
        : 'You have not approved this application yet.',
    },
  ];
  const autoSubmitEligible = checks.every((c) => c.satisfied);
  const blocking = checks.find((c) => !c.satisfied);
  return {
    autoSubmitEligible,
    method: autoSubmitEligible ? 'PROVIDER_INTEGRATION' : 'USER_HANDOFF',
    providerKey: i.provider?.key ?? null,
    checks,
    summary: autoSubmitEligible
      ? `Ready to submit through ${i.provider!.name}.`
      : i.provider === null
        ? 'You submit this application yourself on the official site. ' + i.providerReason
        : `Not eligible for automatic submission: ${blocking!.message}`,
  };
}
