import { HttpStatus } from '@nestjs/common';
import { type AppException } from '../../common/errors/app.exception.js';
import { CONTENT } from './catalogue/index.js';
import { LearningService } from './learning.service.js';

const ANSWER_KEYS = new Set(['correct', 'accept', 'feedback', 'commonMistakes', 'explanation']);

/** Keys present anywhere in a value. */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, found);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysOf(v, found);
    }
  return found;
}

describe('LearningService', () => {
  const service = new LearningService();

  it('lists summaries in catalogue order without curriculum', () => {
    const { courses } = service.list();
    expect(courses.map((c) => c.id)).toEqual(CONTENT.courses.map((c) => c.id));
    for (const c of courses) expect(c).not.toHaveProperty('modules');
  });

  it('derives counts, levels and durations from the content', () => {
    const sql = service.list().courses.find((c) => c.id === 'sql-fundamentals')!;
    const source = CONTENT.courses.find((c) => c.id === 'sql-fundamentals')!;
    const lessons = source.modules.flatMap((m) => m.lessons);
    expect(sql.lessonCount).toBe(lessons.length);
    expect(sql.activityCount).toBe(lessons.flatMap((l) => l.activities ?? []).length);
    expect(sql.levels).toEqual({ from: 1, to: 6 });
    expect(sql.hasDiagnostic).toBe(true);
    expect(sql.estimatedHours).toBeGreaterThan(0);
  });

  it('gives planned courses no levels or duration', () => {
    for (const c of service.list({ status: 'PLANNED' }).courses) {
      expect(c.moduleCount).toBe(0);
      expect(c.levels).toBeNull();
      expect(c.estimatedHours).toBeNull();
    }
  });

  it('searches titles, descriptions and skill names, combined with filters', () => {
    expect(service.list({ q: 'sql' }).courses.map((c) => c.id)).toContain('sql-fundamentals');
    expect(service.list({ q: 'PROMPT' }).courses.map((c) => c.id)).toContain(
      'generative-ai-fundamentals',
    );
    expect(service.list({ q: 'summarise relational' }).courses.map((c) => c.id)).toEqual([
      'sql-fundamentals',
    ]);
    expect(
      service
        .list({ skill: 'sql', status: 'PUBLISHED', category: 'DATA' })
        .courses.map((c) => c.id),
    ).toEqual(['sql-fundamentals']);
    expect(
      service
        .list({ role: 'QA_TESTER', difficulty: 'BEGINNER', status: 'PUBLISHED' })
        .courses.map((c) => c.id),
    ).toEqual([
      'javascript-essentials',
      'sql-fundamentals',
      'software-testing-fundamentals',
      'generative-ai-fundamentals',
    ]);
    expect(service.list({ q: 'underwater basket weaving' }).courses).toEqual([]);
  });

  it('returns curriculum in order with no answers in any public activity or diagnostic', () => {
    for (const { id, status } of service.list().courses) {
      const detail = service.get(id);
      expect(detail.modules.map((m) => m.order)).toEqual(detail.modules.map((_, i) => i + 1));
      for (const m of detail.modules) {
        expect(m.lessons.map((l) => l.order)).toEqual(m.lessons.map((_, i) => i + 1));
        for (const l of m.lessons) {
          expect(l.activities.map((a) => a.order)).toEqual(l.activities.map((_, i) => i + 1));
          const leaked = [...keysOf(l.activities)].filter((k) => ANSWER_KEYS.has(k));
          expect(leaked).toEqual([]);
        }
      }
      if (status === 'PUBLISHED' && detail.hasDiagnostic) {
        const leaked = [...keysOf(service.diagnostic(id))].filter((k) => ANSWER_KEYS.has(k));
        expect(leaked).toEqual([]);
      }
    }
  });

  it('keeps answers available server-side for grading', () => {
    const entry = service.activity('sql-fundamentals', 'sql-which-clause-filters');
    expect(entry.lessonId).toBe('sql-select-and-filter');
    expect(entry.activity.type).toBe('MULTIPLE_CHOICE');
  });

  it('treats unknown and malformed ids as 404', () => {
    const status = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return (error as AppException).getStatus();
      }
      return null;
    };
    expect(status(() => service.get('astronaut'))).toBe(HttpStatus.NOT_FOUND);
    expect(status(() => service.get('../etc/passwd'))).toBe(HttpStatus.NOT_FOUND);
    expect(status(() => service.activity('sql-fundamentals', 'js-fill-await'))).toBe(
      HttpStatus.NOT_FOUND,
    );
    expect(status(() => service.lesson('sql-fundamentals', 'nope'))).toBe(HttpStatus.NOT_FOUND);
    expect(status(() => service.diagnostic('frontend-developer'))).toBe(HttpStatus.NOT_FOUND);
  });

  it('lists skills with the courses that teach them, and curated role profiles', () => {
    const sql = service.skills().skills.find((s) => s.id === 'sql')!;
    expect(sql.courseIds).toEqual(
      expect.arrayContaining(['sql-fundamentals', 'backend-developer']),
    );
    const role = service.roles().roles.find((r) => r.id === 'DATA_ANALYST')!;
    expect(role.coreSkills.map((s) => s.id)).toContain('sql');
    expect(role.evidence.kind).toBe('CURATED');
    expect(role.evidence.limitations).toMatch(/not derived from job-market statistics/i);
  });
});
