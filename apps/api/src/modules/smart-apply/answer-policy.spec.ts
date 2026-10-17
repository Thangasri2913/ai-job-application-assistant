import {
  answerKeyOf,
  reasonFor,
  resolveAnswer,
  type SavedAnswer,
  sensitivityOf,
  validUntil,
} from './answer-policy.js';

const now = new Date('2026-10-13T10:00:00Z');
const noProfile = null;
const profile = {
  noticePeriod: '30 days',
  workAuthorization: 'Indian citizen',
  salaryMin: 1200000,
  salaryMax: null,
  salaryCurrency: 'INR',
};
const saved = (answerKey: string, answer: string, validUntilDate: Date | null = null) =>
  new Map<string, SavedAnswer>([
    [answerKey, { id: 'pa1', answerKey, answer, validUntil: validUntilDate }],
  ]);

describe('answer policy', () => {
  it('classifies sensitive and demographic questions', () => {
    expect(sensitivityOf('Will you require visa sponsorship?', 'WORK_AUTHORIZATION')).toBe(
      'SENSITIVE',
    );
    expect(sensitivityOf('What are your salary expectations?', 'SALARY')).toBe('SENSITIVE');
    expect(sensitivityOf('Have you ever been convicted of a crime?', 'OTHER')).toBe('SENSITIVE');
    expect(sensitivityOf('I certify that the information is true and complete', 'OTHER')).toBe(
      'SENSITIVE',
    );
    expect(sensitivityOf('What is your gender?', 'OTHER')).toBe('DEMOGRAPHIC');
    expect(sensitivityOf('Are you a protected veteran?', 'OTHER')).toBe('DEMOGRAPHIC');
    expect(sensitivityOf('How did you hear about us?', 'OTHER')).toBe('STANDARD');
    expect(sensitivityOf('Which team would you manage?', 'OTHER')).toBe('STANDARD'); // not "age"
  });

  it('keys reusable answers by meaning only where the meaning is fixed', () => {
    expect(answerKeyOf('When can you start?', 'NOTICE_PERIOD', 'STANDARD')).toBe('NOTICE_PERIOD');
    expect(answerKeyOf('Do you need sponsorship?', 'WORK_AUTHORIZATION', 'SENSITIVE')).toBe(
      'q:do you need sponsorship',
    );
    expect(answerKeyOf('Why do you want to work here?', 'MOTIVATION', 'STANDARD')).toBeNull();
    expect(answerKeyOf('What is your gender?', 'OTHER', 'DEMOGRAPHIC')).toBeNull();
  });

  it('reuses a confirmed standard answer as confirmed', () => {
    const q = {
      question: 'How did you hear about us?',
      questionType: 'OTHER' as const,
      sensitivity: 'STANDARD' as const,
      options: [],
    };
    expect(
      resolveAnswer(q, saved('q:how did you hear about us', 'LinkedIn'), noProfile, now),
    ).toEqual({
      answer: 'LinkedIn',
      prefilledFrom: 'SAVED_ANSWER',
      confirmed: true,
      profileAnswerId: 'pa1',
    });
  });

  it('only pre-fills sensitive answers: they must be confirmed for each application', () => {
    const q = {
      question: 'Do you need sponsorship?',
      questionType: 'WORK_AUTHORIZATION' as const,
      sensitivity: 'SENSITIVE' as const,
      options: [],
    };
    expect(
      resolveAnswer(q, saved('q:do you need sponsorship', 'No'), noProfile, now),
    ).toMatchObject({
      answer: 'No',
      confirmed: false,
    });
  });

  it('never reuses demographic answers, expired answers or answers outside the options', () => {
    const demographic = {
      question: 'What is your gender?',
      questionType: 'OTHER' as const,
      sensitivity: 'DEMOGRAPHIC' as const,
      options: [],
    };
    expect(
      resolveAnswer(demographic, saved('q:what is your gender', 'x'), profile, now),
    ).toBeNull();
    const notice = {
      question: 'Notice period?',
      questionType: 'NOTICE_PERIOD' as const,
      sensitivity: 'STANDARD' as const,
      options: [],
    };
    const expired = saved('NOTICE_PERIOD', '60 days', new Date('2026-01-01'));
    // Expired: falls back to the profile's stated notice period, unconfirmed.
    expect(resolveAnswer(notice, expired, profile, now)).toMatchObject({
      answer: '30 days',
      prefilledFrom: 'PROFILE',
      confirmed: false,
    });
    const choice = { ...notice, options: ['Immediately', '1 month'] };
    expect(resolveAnswer(choice, saved('NOTICE_PERIOD', '60 days'), profile, now)).toBeNull();
  });

  it('asks the user when nothing was provided (no guessing)', () => {
    const q = {
      question: 'Notice period?',
      questionType: 'NOTICE_PERIOD' as const,
      sensitivity: 'STANDARD' as const,
      options: [],
    };
    expect(resolveAnswer(q, new Map(), { ...profile, noticePeriod: null }, now)).toBeNull();
    const other = {
      question: 'Favourite framework?',
      questionType: 'OTHER' as const,
      sensitivity: 'STANDARD' as const,
      options: [],
    };
    expect(resolveAnswer(other, new Map(), profile, now)).toBeNull();
  });

  it('expires salary and notice answers sooner than others', () => {
    expect(validUntil('SALARY', now).toISOString()).toBe('2027-01-11T10:00:00.000Z');
    expect(validUntil('OTHER', now).toISOString()).toBe('2027-10-13T10:00:00.000Z');
  });

  it('explains why information is needed without suggesting an answer', () => {
    expect(
      reasonFor({
        required: true,
        origin: 'employer’s Greenhouse application form',
        sensitivity: 'SENSITIVE',
        questionType: 'WORK_AUTHORIZATION',
      }),
    ).toMatch(/required by the employer’s Greenhouse application form.*legal statement/);
  });
});
