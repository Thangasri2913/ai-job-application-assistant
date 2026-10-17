import {
  CANCELLABLE_STATES,
  canTransition,
  SMART_APPLY_STATES,
  SMART_APPLY_TRANSITIONS,
} from '@job-assist/shared';

describe('Smart Apply state machine', () => {
  it('follows the happy paths for handoff and authorised submission', () => {
    const handoff = [
      'DISCOVERED',
      'PREPARING',
      'NEEDS_USER_INPUT',
      'READY_FOR_REVIEW',
      'AWAITING_USER_SUBMISSION',
      'SUBMITTED',
    ] as const;
    const integration = ['READY_FOR_REVIEW', 'SUBMITTING', 'SUBMITTED'] as const;
    for (const path of [handoff, integration]) {
      for (let i = 1; i < path.length; i++)
        expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
    }
  });

  it('never reaches SUBMITTED without a submission step', () => {
    const into = SMART_APPLY_STATES.filter((s) => canTransition(s, 'SUBMITTED'));
    expect(into.sort()).toEqual(['AWAITING_USER_SUBMISSION', 'SUBMITTING']);
  });

  it('treats SUBMITTED as final and lets a cancelled application be prepared again', () => {
    expect(SMART_APPLY_TRANSITIONS.SUBMITTED).toEqual([]);
    expect(SMART_APPLY_TRANSITIONS.CANCELLED).toEqual(['PREPARING']);
  });

  it('allows cancelling only before anything is sent', () => {
    expect(CANCELLABLE_STATES).not.toContain('SUBMITTING');
    expect(CANCELLABLE_STATES).not.toContain('SUBMITTED');
    expect(CANCELLABLE_STATES).toContain('AWAITING_USER_SUBMISSION');
  });

  it('can only start submitting from a reviewed application', () => {
    const into = SMART_APPLY_STATES.filter((s) => canTransition(s, 'SUBMITTING'));
    expect(into).toEqual(['READY_FOR_REVIEW']);
  });
});
