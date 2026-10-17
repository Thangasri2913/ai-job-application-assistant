import { evaluateEligibility, type EligibilityInput } from './eligibility.js';
import { discoveryOnlyReason } from './submission/submission-provider.js';

const eligible: EligibilityInput = {
  provider: { key: 'test-ats', name: 'Test ATS' },
  providerReason: '',
  autoSubmitEnabled: true,
  mode: 'HYBRID',
  consentValid: true,
  submissionsToday: 0,
  dailySubmissionLimit: 3,
  outstandingQuestions: 0,
  approved: true,
};

describe('submission eligibility', () => {
  it('is eligible only when every check passes', () => {
    expect(evaluateEligibility(eligible)).toMatchObject({
      autoSubmitEligible: true,
      method: 'PROVIDER_INTEGRATION',
      providerKey: 'test-ats',
    });
    const failing: [Partial<EligibilityInput>, string][] = [
      [
        { provider: null, providerReason: discoveryOnlyReason('greenhouse') },
        'PROVIDER_INTEGRATION',
      ],
      [{ autoSubmitEnabled: false }, 'AUTO_SUBMIT_ENABLED'],
      [{ mode: 'PREPARE_ONLY' }, 'MODE'],
      [{ consentValid: false }, 'CONSENT'],
      [{ submissionsToday: 3 }, 'DAILY_LIMIT'],
      [{ outstandingQuestions: 2 }, 'ANSWERS_COMPLETE'],
      [{ approved: false }, 'APPROVED'],
    ];
    for (const [change, code] of failing) {
      const result = evaluateEligibility({ ...eligible, ...change });
      expect(result.autoSubmitEligible).toBe(false);
      expect(result.method).toBe('USER_HANDOFF');
      expect(result.checks.filter((c) => !c.satisfied).map((c) => c.code)).toEqual([code]);
    }
  });

  it('explains discovery-only sources as a handoff', () => {
    const result = evaluateEligibility({
      ...eligible,
      provider: null,
      providerReason: discoveryOnlyReason('greenhouse'),
    });
    expect(result.summary).toMatch(
      /^You submit this application yourself on the official site\. Greenhouse is used here for discovery only/,
    );
    expect(discoveryOnlyReason(null)).toBe(
      'No authorised submission integration exists for this job.',
    );
  });
});
