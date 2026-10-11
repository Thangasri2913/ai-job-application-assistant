import {
  checkLimits,
  countCharacters,
  countWords,
  fitToLimits,
  parseAnswerLimits,
} from '@job-assist/shared';
import { mammothText } from './test-helpers.fixture.js';
import { buildDocx } from '../../common/documents/docx-writer.js';
import { validateResumeFile } from '../resumes/parsing/resume-file-validator.js';
import { buildVerifiedFacts, isGrounded, unsupportedClaims } from './grounding.js';
import { context, profile, RESUME } from './preparation.fixture.js';
import { classifyQuestion, ruleAnswer } from './rules/answer.rules.js';
import { templateCoverLetter } from './rules/cover-letter.template.js';
import { ruleSuggestions } from './rules/resume-suggestions.rules.js';
import { applySuggestions } from './rules/tailored-draft.js';

describe('word / character limits', () => {
  it('parses limits stated in questions', () => {
    expect(parseAnswerLimits('Describe your React experience (Maximum 200 words)')).toEqual({
      maxWords: 200,
      maxCharacters: null,
    });
    expect(parseAnswerLimits('Why us? max 500 characters')).toEqual({
      maxWords: null,
      maxCharacters: 500,
    });
    expect(parseAnswerLimits('Up to 1,000 chars')).toEqual({ maxWords: null, maxCharacters: 1000 });
    expect(parseAnswerLimits('250 words max')).toEqual({ maxWords: 250, maxCharacters: null });
    expect(parseAnswerLimits('What is your expected salary?')).toEqual({
      maxWords: null,
      maxCharacters: null,
    });
  });

  it('counts and fits text', () => {
    expect(countWords('  one two\nthree ')).toBe(3);
    expect(countCharacters('café 👍')).toBe(6);
    expect(checkLimits('a b c', { maxWords: 2, maxCharacters: null })).toMatchObject({
      withinLimits: false,
      overBy: { words: 1 },
    });
    const text = 'One two three. Four five six seven. Eight nine ten.';
    const fitted = fitToLimits(text, { maxWords: 8, maxCharacters: null });
    expect(fitted).toBe('One two three. Four five six seven.');
    expect(
      checkLimits(fitToLimits(text, { maxWords: null, maxCharacters: 20 }), {
        maxWords: null,
        maxCharacters: 20,
      }).withinLimits,
    ).toBe(true);
    expect(fitToLimits('short', { maxWords: 10, maxCharacters: 100 })).toBe('short');
  });
});

describe('grounding', () => {
  const facts = buildVerifiedFacts(RESUME, profile());
  it('flags skills and numbers that the user data does not contain', () => {
    expect(
      isGrounded(unsupportedClaims('I built Angular dashboards for 12 device types.', facts)),
    ).toBe(true);
    expect(
      unsupportedClaims('I deployed it on AWS with Docker, improving speed by 40%.', facts),
    ).toEqual({ skills: ['AWS', 'Docker'], numbers: ['40'] });
  });
});

describe('rule-based resume suggestions', () => {
  const suggestions = ruleSuggestions(context());

  it('moves buried relevant bullets up, without changing their wording', () => {
    const bullet = suggestions.find(
      (s) =>
        s.kind === 'REORDER' &&
        s.section === 'EXPERIENCE' &&
        s.originalText?.startsWith('Developed dashboards'),
    );
    expect(bullet).toMatchObject({
      suggestedText: 'Developed dashboards for industrial IoT applications using Angular',
    });
    expect(bullet?.reason).toMatch(/bullet 3 under Frontend Developer at Acme/);
  });

  it('lists required skills first in the skills section, adding none', () => {
    const skills = suggestions.find((s) => s.kind === 'REORDER' && s.section === 'SKILLS')!;
    expect(skills.suggestedText).toBe('Angular, TypeScript, RxJS, Git');
    expect(skills.reason).toMatch(/No skills are added or removed/);
  });

  it('states missing requirements plainly and never fills them', () => {
    const docker = suggestions.find((s) => s.jobRequirement === 'Docker')!;
    expect(docker).toMatchObject({ kind: 'GAP', suggestedText: null });
    expect(docker.reason).toBe(
      'The job requires Docker, but no Docker experience was found in this resume or your career profile. Do not add Docker unless you genuinely have this experience.',
    );
    expect(suggestions.find((s) => s.jobRequirement === 'AWS')?.reason).toMatch(/nice to have/);
  });

  it('points to the career profile when it has a skill this resume lacks', () => {
    const withDocker = ruleSuggestions(
      context(RESUME, profile({}, { skills: [{ id: 's1', name: 'Docker', category: 'DEVOPS' }] })),
    );
    expect(withDocker.find((s) => s.jobRequirement === 'Docker')).toMatchObject({
      kind: 'EMPHASIZE',
    });
  });
});

describe('tailored draft', () => {
  it('applies accepted suggestions to a copy and leaves the source untouched', () => {
    const before = structuredClone(RESUME);
    const s = ruleSuggestions(context());
    const bullet = s.find((x) => x.kind === 'REORDER' && x.section === 'EXPERIENCE')!;
    const skills = s.find((x) => x.kind === 'REORDER' && x.section === 'SKILLS')!;
    const { content, applied } = applySuggestions(RESUME, [
      {
        id: 'b',
        kind: 'REORDER',
        originalText: bullet.originalText,
        finalText: bullet.suggestedText,
        target: bullet.target,
      },
      {
        id: 'k',
        kind: 'REORDER',
        originalText: skills.originalText,
        finalText: skills.suggestedText,
        target: skills.target,
      },
      {
        id: 'r',
        kind: 'REWRITE',
        originalText: 'Reviewed pull requests',
        finalText: 'Reviewed pull requests for the frontend team',
        target: null,
      },
    ]);
    expect(applied.sort()).toEqual(['b', 'k', 'r']);
    expect(content.experiences[0]!.responsibilities[0]).toBe(bullet.originalText);
    expect(content.experiences[0]!.responsibilities).toContain(
      'Reviewed pull requests for the frontend team',
    );
    expect(content.skills.map((x) => x.name)).toEqual(['Angular', 'TypeScript', 'RxJS', 'Git']);
    expect(RESUME).toEqual(before);
  });

  it('moves a bullet up with the user’s own rewording', () => {
    const bullet = ruleSuggestions(context()).find(
      (x) => x.kind === 'REORDER' && x.section === 'EXPERIENCE',
    )!;
    const { content } = applySuggestions(RESUME, [
      {
        id: 'b',
        kind: 'REORDER',
        originalText: bullet.originalText,
        finalText: 'Built industrial IoT dashboards in Angular',
        target: bullet.target,
      },
    ]);
    expect(content.experiences[0]!.responsibilities[0]).toBe(
      'Built industrial IoT dashboards in Angular',
    );
    expect(content.experiences[0]!.responsibilities).not.toContain(bullet.originalText);
  });
});

describe('template cover letter', () => {
  const ctx = context();
  const { text, notClaimed } = templateCoverLetter(ctx);

  it('is specific to the job and quotes the resume verbatim', () => {
    expect(text).toMatch(/^Dear Hiring Team,/);
    expect(text).toContain('Frontend Developer position at ABC Technologies');
    expect(text).toContain('- Developed dashboards for industrial IoT applications using Angular');
    expect(text).toMatch(/Regards,\nThanga Sri$/);
  });

  it('never claims what the resume lacks', () => {
    expect(notClaimed).toContain('Docker');
    expect(text).not.toMatch(/Docker|AWS/);
    expect(isGrounded(unsupportedClaims(text, ctx.facts))).toBe(true);
  });
});

describe('rule-based answers', () => {
  it('classifies questions', () => {
    expect(classifyQuestion('What is your expected salary?')).toBe('SALARY');
    expect(classifyQuestion('Why do you want to work here?')).toBe('MOTIVATION');
    expect(classifyQuestion('Describe your experience with Angular.')).toBe('EXPERIENCE');
    expect(classifyQuestion('When can you start?')).toBe('NOTICE_PERIOD');
  });

  it('answers only from verified data and says what is missing', () => {
    const ctx = context();
    expect(ruleAnswer(ctx, 'When can you start?', 'NOTICE_PERIOD')).toEqual({
      answer: 'My notice period is 30 days.',
      missingInformation: [],
    });
    expect(ruleAnswer(ctx, 'Expected salary?', 'SALARY')).toMatchObject({
      answer: null,
      missingInformation: [expect.stringMatching(/expected salary/)],
    });
    expect(ruleAnswer(ctx, 'Why us?', 'MOTIVATION').answer).toBeNull();
    const angular = ruleAnswer(
      ctx,
      'Describe your experience with Angular and Docker.',
      'EXPERIENCE',
    );
    expect(angular.answer).toBe(
      'As Frontend Developer at Acme, I used Angular: Developed dashboards for industrial IoT applications using Angular.',
    );
    expect(angular.missingInformation).toEqual([
      'Your experience with Docker (not found in this resume)',
    ]);
  });

  it('formats a salary range from the profile', () => {
    const ctx = context(
      RESUME,
      profile({ salaryMin: 1200000, salaryMax: 1800000, salaryCurrency: 'INR' }),
    );
    expect(ruleAnswer(ctx, 'Salary?', 'SALARY').answer).toBe(
      'My expected salary is INR 1,200,000–1,800,000.',
    );
  });
});

describe('DOCX writer', () => {
  it('produces a file that passes the upload validator and keeps the text', async () => {
    const docx = buildDocx(
      'Dear Hiring Team,\n\nI am applying & excited <here>.\n\nRegards,\nThanga',
    );
    await expect(validateResumeFile(docx, 'letter.docx', 5 * 1024 * 1024)).resolves.toMatchObject({
      kind: 'docx',
    });
    expect(await mammothText(docx)).toContain('I am applying & excited <here>.');
  });
});
