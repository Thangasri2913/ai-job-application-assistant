import { allowedNextStatuses, isValidAppliedDate } from './application-status.js';

describe('allowedNextStatuses', () => {
  it('follows the pipeline forward', () => {
    expect(allowedNextStatuses('SAVED', null)).toEqual(['PREPARING', 'APPLIED', 'WITHDRAWN']);
    expect(allowedNextStatuses('APPLIED', 'PREPARING')).toContain('INTERVIEW');
  });

  it('never allows staying in place or jumping from saved straight to an interview', () => {
    expect(allowedNextStatuses('SAVED', null)).not.toContain('SAVED');
    expect(allowedNextStatuses('SAVED', null)).not.toContain('INTERVIEW');
    expect(allowedNextStatuses('PREPARING', 'SAVED')).not.toContain('OFFER');
  });

  it('allows correcting the last change by going back one step', () => {
    expect(allowedNextStatuses('REJECTED', null)).toEqual([]);
    expect(allowedNextStatuses('REJECTED', 'INTERVIEW')).toEqual(['INTERVIEW']);
    expect(allowedNextStatuses('INTERVIEW', 'APPLIED')).toContain('APPLIED');
  });
});

describe('isValidAppliedDate', () => {
  it('rejects future dates', () => {
    expect(isValidAppliedDate('2026-10-11', '2026-10-11')).toBe(true);
    expect(isValidAppliedDate('2026-10-12', '2026-10-11')).toBe(false);
  });
});
