import { LEARNING_ID_PATTERN, LEARNING_ROLES } from '@job-assist/shared';
import type { CourseSource } from './content.js';
import { CONTENT, validateCatalogue } from './index.js';

const clone = <T>(value: T): T => structuredClone(value);
const course = (id: string) => clone(CONTENT.courses.find((c) => c.id === id)!);
const withCourses = (courses: CourseSource[]) => ({ ...CONTENT, courses });

describe('learning catalogue content', () => {
  it('passes every integrity rule', () => {
    expect(validateCatalogue(CONTENT)).toEqual([]);
  });

  it('has a role profile and at least one course for every role', () => {
    for (const role of LEARNING_ROLES) {
      expect(CONTENT.roles.some((r) => r.id === role)).toBe(true);
      expect(CONTENT.courses.some((c) => c.roles.includes(role))).toBe(true);
    }
  });

  it('covers software development and emerging fields', () => {
    const categories = new Set(CONTENT.courses.map((c) => c.category));
    for (const category of [
      'SOFTWARE_DEVELOPMENT',
      'DATA',
      'AI_AND_MACHINE_LEARNING',
      'CLOUD_AND_DEVOPS',
      'CYBERSECURITY',
      'QUALITY_ASSURANCE',
      'DESIGN',
    ])
      expect(categories).toContain(category);
  });

  it('uses slug ids that are unique across all lessons and activities', () => {
    const lessons = CONTENT.courses.flatMap((c) => c.modules.flatMap((m) => m.lessons));
    const activityIds = lessons.flatMap((l) => (l.activities ?? []).map((a) => a.id));
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    expect(new Set(activityIds).size).toBe(activityIds.length);
    for (const id of [...lessons.map((l) => l.id), ...activityIds])
      expect(id).toMatch(LEARNING_ID_PATTERN);
  });

  it('gives every published skill course a diagnostic and interactive, graded activities', () => {
    for (const c of CONTENT.courses.filter(
      (x) => x.status === 'PUBLISHED' && x.format === 'SKILL_COURSE',
    )) {
      expect(c.diagnostic?.questions.length).toBeGreaterThan(0);
      const activities = c.modules.flatMap((m) => m.lessons.flatMap((l) => l.activities ?? []));
      expect(
        activities.filter((a) =>
          ['MULTIPLE_CHOICE', 'FILL_IN_THE_GAP', 'SHORT_ANSWER'].includes(a.type),
        ).length,
      ).toBeGreaterThanOrEqual(5);
      expect(c.modules.some((m) => m.project)).toBe(true);
    }
  });

  it('gives every published course at least one graded activity', () => {
    for (const c of CONTENT.courses.filter((x) => x.status === 'PUBLISHED')) {
      const graded = c.modules
        .flatMap((m) => m.lessons.flatMap((l) => l.activities ?? []))
        .filter((a) => ['MULTIPLE_CHOICE', 'FILL_IN_THE_GAP', 'SHORT_ANSWER'].includes(a.type));
      expect(graded.length, c.id).toBeGreaterThan(0);
    }
  });

  it('gives every resource a descriptive title and a link check', () => {
    const resources = CONTENT.courses.flatMap((c) =>
      c.modules.flatMap((m) => m.lessons.flatMap((l) => l.resources)),
    );
    for (const r of resources) {
      expect(r.title.length, r.id).toBeGreaterThan(8);
      expect(r.linkCheck.status).toBe('REACHABLE');
    }
  });

  it('labels authored content honestly: AI-generated, not reviewed, no review dates', () => {
    for (const c of CONTENT.courses) {
      expect(c.provenance).toEqual({ origin: 'AI_GENERATED', review: { status: 'UNREVIEWED' } });
      expect(c.lastReviewedOn).toBeNull();
      for (const lesson of c.modules.flatMap((m) => m.lessons)) {
        expect(lesson.provenance.review.status).toBe('UNREVIEWED');
        for (const r of lesson.resources) {
          expect(r.provenance).toBe('CURATED');
          expect(r.url).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it('offers interview practice and a project challenge for frontend, backend and SQL', () => {
    const skills = new Set(CONTENT.interviewQuestions.map((q) => q.skillId));
    for (const skill of [
      'javascript',
      'sql',
      'rest-apis',
      'react',
      'software-testing',
      'generative-ai',
    ])
      expect(skills, skill).toContain(skill);
    const courses = CONTENT.projectChallenges.flatMap((c) => c.courseIds);
    for (const course of ['frontend-developer', 'backend-developer', 'sql-fundamentals'])
      expect(courses).toContain(course);
    for (const c of CONTENT.projectChallenges) {
      expect(c.acceptanceCriteria.length).toBeGreaterThan(0);
      expect(c.selfReview.length).toBeGreaterThan(0);
      expect(c.testCases.length).toBeGreaterThan(0);
      expect(c.provenance.review.status).toBe('UNREVIEWED');
    }
  });

  it('keeps planned courses empty', () => {
    for (const c of CONTENT.courses.filter((x) => x.status === 'PLANNED')) {
      expect(c.modules).toEqual([]);
      expect(c.diagnostic).toBeUndefined();
    }
  });
});

describe('validateCatalogue', () => {
  it('rejects interview questions with unknown lessons, skills or broken patterns', () => {
    const [first, ...rest] = CONTENT.interviewQuestions;
    const broken = {
      ...first!,
      skillId: 'astrology',
      concepts: [
        { id: 'a', label: 'A', patterns: ['(unclosed'], lessonId: 'sql-joins' },
        { id: 'b', label: 'B', patterns: ['ok'], lessonId: 'no-such-lesson' },
      ],
    };
    expect(validateCatalogue({ ...CONTENT, interviewQuestions: [broken, ...rest] })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown skill "astrology"'),
        expect.stringContaining('invalid pattern "(unclosed"'),
        expect.stringContaining('links to unknown lesson "no-such-lesson"'),
      ]),
    );
  });

  it('rejects project challenges linked to planned courses or unknown projects', () => {
    const [first, ...rest] = CONTENT.projectChallenges;
    const broken = { ...first!, courseIds: ['python-fundamentals'], expandsProjectIds: ['nope'] };
    expect(validateCatalogue({ ...CONTENT, projectChallenges: [broken, ...rest] })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('course "python-fundamentals" is not published'),
        expect.stringContaining('unknown course project "nope"'),
      ]),
    );
  });

  it('rejects a skill name or spelling shared by two skills', () => {
    const skills = [
      ...CONTENT.skills,
      {
        id: 'scripting',
        name: 'Scripting',
        category: 'SOFTWARE_DEVELOPMENT' as const,
        description: 'x',
        alsoKnownAs: ['JS'],
      },
    ];
    expect(validateCatalogue({ ...CONTENT, skills })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('skill name "JS" is used by both "javascript" and "scripting"'),
      ]),
    );
  });

  it('rejects duplicate ids, bad slugs and gaps in ordering', () => {
    const c = course('sql-fundamentals');
    c.modules[1]!.id = c.modules[0]!.id;
    c.modules[0]!.lessons[1]!.order = 5;
    c.modules[0]!.lessons[0]!.id = 'Not A Slug';
    expect(validateCatalogue(withCourses([c]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate module id'),
        expect.stringContaining('order must be'),
        expect.stringContaining('not a lowercase-hyphen slug'),
      ]),
    );
  });

  it('rejects invalid activities: no correct option, unknown skills and stray diagnostic lessons', () => {
    const c = course('sql-fundamentals');
    const activity = c.modules[0]!.lessons[0]!.activities![0]!;
    if (activity.type !== 'MULTIPLE_CHOICE') throw new Error('expected multiple choice');
    activity.options = activity.options.map((o) => ({ ...o, correct: false }));
    c.skillIds = [...c.skillIds, 'astrology'];
    c.diagnostic!.questions[0]!.lessonId = 'js-async';
    expect(validateCatalogue(withCourses([c]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('exactly one option must be correct'),
        expect.stringContaining('unknown skill "astrology"'),
        expect.stringContaining('outside its course'),
      ]),
    );
  });

  it('rejects non-https resources, planned courses with content and fake review dates', () => {
    const c = course('javascript-essentials');
    c.modules[0]!.lessons[0]!.resources = [
      { ...c.modules[0]!.lessons[0]!.resources[0]!, url: 'http://example.com' },
    ];
    c.lastReviewedOn = '2026-10-01';
    const planned: CourseSource = {
      ...course('sql-fundamentals'),
      id: 'planned-copy',
      status: 'PLANNED',
    };
    expect(validateCatalogue(withCourses([c, planned]))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must use https'),
        expect.stringContaining('PLANNED but has content'),
        expect.stringContaining('review date but is not marked REVIEWED'),
      ]),
    );
  });
});
