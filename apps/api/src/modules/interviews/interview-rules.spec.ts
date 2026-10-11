import { context } from '../application-preparation/preparation.fixture.js';
import { evaluateWithRules } from './rules/answer-evaluator.js';
import { generateQuestions } from './rules/question-generator.js';
import { buildReport } from './rules/report-builder.js';

describe('rule-based question generation', () => {
  const ctx = context();
  const mixed = generateQuestions(ctx, { focus: 'MIXED', difficulty: 'MEDIUM', count: 10 });

  it('produces the requested number of distinct questions in a balanced order', () => {
    expect(mixed).toHaveLength(10);
    expect(new Set(mixed.map((q) => q.question)).size).toBe(10);
    expect(mixed[0]).toMatchObject({
      category: 'INTRODUCTION',
      question: 'Tell me about yourself and what draws you to this Frontend Developer role.',
    });
    expect(new Set(mixed.map((q) => q.category))).toEqual(
      new Set([
        'INTRODUCTION',
        'RESUME',
        'TECHNICAL',
        'PROJECT',
        'ROLE_SPECIFIC',
        'BEHAVIORAL',
        'SITUATIONAL',
      ]),
    );
  });

  it('is personalised to the resume and job', () => {
    expect(mixed.find((q) => q.category === 'RESUME')?.question).toBe(
      'Walk me through your role as Frontend Developer at Acme. What were you responsible for, and what are you proudest of?',
    );
    expect(
      mixed.some(
        (q) =>
          q.question === 'How would you improve the performance of a large Angular application?',
      ),
    ).toBe(true);
    expect(mixed.find((q) => q.category === 'ROLE_SPECIFIC')?.question).toMatch(
      /^This role involves “Build interactive dashboards in Angular”/,
    );
  });

  it('asks openly about missing skills and never presumes experience', () => {
    const technical = generateQuestions(ctx, {
      focus: 'TECHNICAL',
      difficulty: 'MEDIUM',
      count: 15,
    });
    const docker = technical.find((q) => q.question.includes('Docker'))!;
    expect(docker.question).toBe(
      'The role requires Docker. What is your experience with Docker or similar tools, and how would you get up to speed?',
    );
    expect(docker.rationale).toMatch(/wasn’t found in your resume.*Answer honestly/);
    expect(
      technical.some((q) => /your (experience|work) (with|in) Docker\b(?! or)/.test(q.question)),
    ).toBe(false);
  });

  it('follows the focus and difficulty', () => {
    const behavioral = generateQuestions(ctx, {
      focus: 'BEHAVIORAL',
      difficulty: 'HARD',
      count: 5,
    });
    expect(
      behavioral.every((q) =>
        ['INTRODUCTION', 'BEHAVIORAL', 'SITUATIONAL', 'PROJECT'].includes(q.category),
      ),
    ).toBe(true);
    expect(behavioral.every((q) => q.difficulty === 'HARD')).toBe(true);
    const easy = generateQuestions(ctx, { focus: 'TECHNICAL', difficulty: 'EASY', count: 10 });
    expect(
      easy.some((q) => q.question === 'How do Angular components communicate with each other?'),
    ).toBe(true);
    const hr = generateQuestions(ctx, { focus: 'HR', difficulty: 'MEDIUM', count: 10 });
    expect(hr.find((q) => q.question.startsWith('What is your notice period'))?.rationale).toBe(
      'Your profile says: 30 days.',
    );
  });
});

describe('rule-based answer evaluation', () => {
  it('detects STAR structure and asks for a genuine result when it is missing', () => {
    const ev = evaluateWithRules({
      question: 'Tell me about a time you disagreed with a teammate.',
      category: 'BEHAVIORAL',
      difficulty: 'MEDIUM',
      expectedTopics: ['situation', 'task', 'action', 'result'],
      answer:
        'During a release at my last company, our team disagreed about a caching approach. My role was to own the frontend. I proposed a short spike and I explained the trade-offs to the team.',
    });
    expect(ev.star).toEqual({
      situation: 'PRESENT',
      task: 'PRESENT',
      action: 'PRESENT',
      result: 'MISSING',
    });
    expect(ev.improvements).toContain(
      'Explain the observable result of your action, if you have a genuine result to share.',
    );
    expect(ev.dimensions.technicalAccuracy).toBeNull();
  });

  it('rewards covering the expected topics and penalises vague filler', () => {
    const base = {
      question: 'How would you improve the performance of a large Angular application?',
      category: 'TECHNICAL' as const,
      difficulty: 'MEDIUM' as const,
      expectedTopics: ['Angular', 'change detection', 'OnPush', 'lazy loading', 'trackBy'],
    };
    const good = evaluateWithRules({
      ...base,
      answer:
        'In Angular I start by profiling change detection. For example, at Acme I switched heavy dashboard components to OnPush, added trackBy to large lists and moved rarely used routes to lazy loading. I measure before and after to confirm the gain.',
    });
    const vague = evaluateWithRules({
      ...base,
      answer: 'Basically I did many things and stuff to make it faster.',
    });
    expect(good.overallScore).toBeGreaterThan(vague.overallScore);
    expect(good.strengths[0]).toMatch(
      /^Covers the expected topics: Angular, change detection, OnPush, lazy loading, trackBy/,
    );
    expect(vague.improvements.join(' ')).toMatch(/Avoid vague phrases/);
    expect(vague.improvements.join(' ')).toMatch(/only where it reflects your real experience/);
  });
});

describe('report builder', () => {
  it('averages stored scores, counts unanswered questions as 0 and groups by category and topic', () => {
    const report = buildReport([
      {
        category: 'TECHNICAL',
        expectedTopics: ['Angular', 'OnPush'],
        score: 8,
        strengths: ['Clear'],
        improvements: ['Discuss trade-offs'],
      },
      {
        category: 'TECHNICAL',
        expectedTopics: ['TypeScript'],
        score: 6,
        strengths: ['Clear'],
        improvements: ['Discuss trade-offs'],
      },
      {
        category: 'BEHAVIORAL',
        expectedTopics: ['situation', 'result'],
        score: 7,
        strengths: [],
        improvements: ['Add the result'],
      },
      { category: 'HR', expectedTopics: [], score: null, strengths: [], improvements: [] },
    ]);
    expect(report).toMatchObject({ overallScore: 53, answered: 3, total: 4, strengths: ['Clear'] });
    expect(report.improvements[0]).toBe('1 question was not answered.');
    expect(report.improvements).toContain('Discuss trade-offs');
    expect(report.categories).toEqual([
      { topic: 'Technical', score: 70, questions: 2 },
      { topic: 'Behavioral', score: 70, questions: 1 },
    ]);
    expect(report.topics.map((t) => t.topic)).toEqual(['Angular', 'OnPush', 'TypeScript']); // STAR words aren't topics
  });
});
