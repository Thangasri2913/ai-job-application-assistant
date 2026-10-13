import type { ApplicationStatus } from '@job-assist/shared';
import { highestRank, isSubmitted, outcomeMetrics, rate } from './metrics.js';
import { buildPatterns, strongest } from './patterns.js';
import {
  buildFunnel,
  buildMatchScores,
  buildReport,
  buildResumePerformance,
  buildSkills,
} from './report.js';
import type { ApplicationRecord, CareerData, TargetJobRecord } from './types.js';

const NOW = new Date('2026-10-12T00:00:00Z');
let seq = 0;

/** An application that went through `path` (in order), currently at its last status. */
function app(
  path: ApplicationStatus[],
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  seq++;
  const submitted = path.some((s) => s !== 'SAVED' && s !== 'PREPARING');
  return {
    id: `a${seq}`,
    status: path[path.length - 1]!,
    reached: path,
    appliedAt: submitted ? new Date('2026-10-05T00:00:00Z') : null,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    source: 'LinkedIn',
    jobTitle: 'Frontend Developer',
    companyName: `Company ${seq}`,
    location: 'Bangalore',
    workMode: null,
    seniority: 'MID',
    resume: {
      resumeId: 'r1',
      resumeName: 'Angular Resume',
      resumeVersionId: 'v1',
      versionNumber: 1,
      isCurrent: true,
      resumeArchived: false,
    },
    matchScore: 80,
    requiredSkills: ['Angular', 'TypeScript'],
    rejectionCategory: null,
    ...overrides,
  };
}

const data = (applications: ApplicationRecord[], extra: Partial<CareerData> = {}): CareerData => ({
  applications,
  targetJobs: [],
  resumeVersions: [],
  interviewSessions: [],
  ...extra,
});

describe('metrics', () => {
  it('never manufactures a rate from a zero denominator', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(1, 3)).toBe(0.333);
    const empty = outcomeMetrics([]);
    expect(empty).toMatchObject({
      applications: 0,
      interviewRate: null,
      offerRate: null,
      responseRate: null,
      interviewToOfferRate: null,
      reliable: false,
    });
  });

  it('treats stages as cumulative and counts only submitted applications', () => {
    const saved = app(['SAVED']);
    const offer = app(['SAVED', 'APPLIED', 'OFFER']);
    expect(isSubmitted(saved)).toBe(false);
    expect(highestRank(offer)).toBe(5);
    const m = outcomeMetrics([
      saved,
      app(['APPLIED']),
      app(['APPLIED', 'REJECTED']),
      app(['APPLIED', 'RECRUITER_SCREEN', 'TECHNICAL_INTERVIEW', 'REJECTED']),
      offer,
      app(['APPLIED', 'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'ACCEPTED']),
    ]);
    expect(m).toMatchObject({
      applications: 5,
      responses: 4, // a rejection is a response
      interviews: 3, // technical interview, the offer (cumulative) and the accepted one
      offers: 2,
      accepted: 1,
      rejections: 2,
      interviewRate: 0.6,
      offerRate: 0.4,
      interviewToOfferRate: 0.667,
      reliable: true,
    });
  });

  it('counts an application date without a later status as submitted', () => {
    expect(isSubmitted(app(['SAVED'], { appliedAt: new Date() }))).toBe(true);
  });
});

describe('funnel', () => {
  it('counts each stage as reached-or-later with conversion from the previous stage', () => {
    const f = buildFunnel([
      app(['SAVED']),
      app(['SAVED', 'APPLIED']),
      app(['APPLIED', 'RECRUITER_SCREEN', 'REJECTED'], { rejectionCategory: 'SKILLS_MISMATCH' }),
      app(['APPLIED', 'INTERVIEW', 'OFFER', 'ACCEPTED']),
    ]);
    expect(f.stages.map((s) => [s.stage, s.count, s.conversionFromPrevious])).toEqual([
      ['SAVED', 4, null],
      ['APPLIED', 3, 0.75],
      ['SCREENING', 2, 0.667],
      ['INTERVIEW', 1, 0.5],
      ['FINAL_INTERVIEW', 1, 1],
      ['OFFER', 1, 1],
      ['ACCEPTED', 1, 1],
    ]);
    expect(f.everReached.RECRUITER_SCREEN).toBe(1);
    expect(f.current.REJECTED).toBe(1);
    expect(f.rejectionCategories).toEqual([{ category: 'SKILLS_MISMATCH', count: 1 }]);
  });

  it('returns null conversions after an empty stage', () => {
    const f = buildFunnel([app(['SAVED'])]);
    expect(f.stages[2]).toMatchObject({
      stage: 'SCREENING',
      count: 0,
      conversionFromPrevious: null,
    });
  });
});

describe('resume performance', () => {
  it('reports each exact version, including archived resumes that were used', () => {
    const old = {
      resumeId: 'r2',
      resumeName: 'General Resume',
      resumeVersionId: 'v9',
      versionNumber: 2,
      isCurrent: false,
      resumeArchived: true,
    };
    const rows = buildResumePerformance(
      data(
        [
          app(['APPLIED', 'INTERVIEW']),
          app(['APPLIED']),
          app(['APPLIED', 'REJECTED'], { resume: old }),
        ],
        {
          resumeVersions: [
            { ...app([]).resume, jobsMatched: 4, averageMatchScore: 78 },
            {
              resumeId: 'r3',
              resumeName: 'Unused',
              resumeVersionId: 'v5',
              versionNumber: 1,
              isCurrent: true,
              resumeArchived: false,
              jobsMatched: 0,
              averageMatchScore: null,
            },
          ],
        },
      ),
    );
    expect(rows.map((r) => [r.resumeName, r.versionNumber, r.applications, r.interviews])).toEqual([
      ['Angular Resume', 1, 2, 1],
      ['General Resume', 2, 1, 0],
      ['Unused', 1, 0, 0],
    ]);
    expect(rows[0]).toMatchObject({
      jobsMatched: 4,
      averageMatchScore: 78,
      interviewRate: 0.5,
      reliable: false,
    });
    expect(rows[1]).toMatchObject({
      resumeArchived: true,
      jobsMatched: 0,
      averageMatchScore: null,
    });
  });
});

describe('match scores', () => {
  it('buckets the stored score snapshot and reports unscored applications separately', () => {
    const m = buildMatchScores([
      app(['APPLIED', 'INTERVIEW'], { matchScore: 92 }),
      app(['APPLIED'], { matchScore: 85 }),
      app(['APPLIED'], { matchScore: 40 }),
      app(['APPLIED'], { matchScore: null }),
      app(['SAVED'], { matchScore: 99 }),
    ]);
    expect(m.buckets.map((b) => [b.key, b.applications, b.interviews])).toEqual([
      ['0-49', 1, 0],
      ['80-89', 1, 0],
      ['90-100', 1, 1],
    ]);
    expect(m.unscored).toBe(1);
    expect(m.alignedShare).toBe(0.667);
  });
});

describe('skills', () => {
  const job = (skills: TargetJobRecord['skills']): TargetJobRecord => ({
    jobId: `j${++seq}`,
    skills,
  });

  it('finds frequently requested skills with limited resume evidence', () => {
    const jobs = [
      job([
        { name: 'React', importance: 'REQUIRED', status: 'MISSING' },
        { name: 'TypeScript', importance: 'REQUIRED', status: 'MATCH' },
      ]),
      job([
        { name: 'React.js', importance: 'REQUIRED', status: 'MISSING' },
        { name: 'TypeScript', importance: 'PREFERRED', status: 'MATCH' },
      ]),
      job([
        { name: 'React', importance: 'PREFERRED', status: 'PARTIAL' },
        { name: 'TypeScript', importance: 'REQUIRED', status: 'MATCH' },
      ]),
      job([{ name: 'Docker', importance: 'REQUIRED', status: 'MISSING' }]),
    ];
    const rows = buildSkills(
      data([app(['APPLIED', 'INTERVIEW'], { requiredSkills: ['React'] }), app(['APPLIED'])], {
        targetJobs: jobs,
      }),
    );
    const react = rows.find((r) => r.skill === 'React')!;
    expect(react).toMatchObject({
      jobs: 3,
      requiredIn: 2,
      coverage: { matched: 0, partial: 1, missing: 2 },
      coverageLevel: 'LIMITED',
      isGap: true,
    });
    expect(react.outcomes).toMatchObject({ applications: 1, interviews: 1 });
    expect(rows.find((r) => r.skill === 'TypeScript')).toMatchObject({
      coverageLevel: 'STRONG',
      isGap: false,
    });
    // Too infrequent to be called a recurring gap.
    expect(rows.find((r) => r.skill === 'Docker')).toMatchObject({ jobs: 1, isGap: false });
  });

  it('does not call a skill a gap when no resume was compared', () => {
    const jobs = [1, 2, 3].map(() => job([{ name: 'Go', importance: 'REQUIRED', status: null }]));
    expect(buildSkills(data([], { targetJobs: jobs }))[0]).toMatchObject({ isGap: false });
  });
});

describe('insufficient data and patterns', () => {
  it('explains what is missing and builds no outcome patterns below the threshold', () => {
    const report = buildReport(
      data([app(['APPLIED', 'INTERVIEW']), app(['APPLIED']), app(['SAVED'])]),
      NOW,
    );
    expect(report.limitations).toMatchObject({ submitted: 2, sufficientForPatterns: false });
    expect(report.limitations.messages[0]).toBe(
      'You have 2 submitted applications. At least 10 are needed before reliable performance patterns can be identified; until then counts are shown without comparisons.',
    );
    expect(report.patterns.filter((p) => p.kind.startsWith('STRONGEST'))).toEqual([]);
    expect(report.totals).toMatchObject({
      tracked: 3,
      submitted: 2,
      notSubmitted: 1,
      inProgress: 2,
    });
  });

  it('handles no applications at all', () => {
    const report = buildReport(data([]), NOW);
    expect(report.totals.outcomes.interviewRate).toBeNull();
    expect(report.funnel.stages.every((s) => s.count === 0)).toBe(true);
    expect(report.limitations.messages[0]).toMatch(/haven’t tracked any applications/);
    expect(report.patterns).toEqual([]);
  });

  it('identifies the strongest role only between groups with enough data', () => {
    const apps = [
      ...[1, 2, 3, 4, 5, 6].map((i) =>
        app(i <= 3 ? ['APPLIED', 'INTERVIEW'] : ['APPLIED', 'REJECTED'], {
          jobTitle: 'Angular Developer',
        }),
      ),
      ...[1, 2, 3, 4, 5, 6].map((i) =>
        app(i <= 1 ? ['APPLIED', 'INTERVIEW'] : ['APPLIED'], { jobTitle: 'React Developer' }),
      ),
      app(['APPLIED', 'OFFER'], { jobTitle: 'Vue Developer' }), // 100% but only one application
    ];
    const report = buildReport(data(apps), NOW);
    const role = report.patterns.find((p) => p.kind === 'STRONGEST_ROLE')!;
    expect(role.title).toBe('Strongest observed role: Angular Developer');
    expect(role.finding).toBe(
      'Angular Developer had a 50% interview rate across 6 applications, compared with 17% across 6 applications in your other roles with enough data.',
    );
    expect(role.confidence).toBe('LOW');
  });

  it('reports no "strongest" group when the groups do not differ or only one is reliable', () => {
    const row = (label: string, applications: number, interviews: number) => ({
      label,
      applications,
      interviews,
      interviewRate: interviews / applications,
      reliable: applications >= 5,
    });
    expect(strongest('STRONGEST_ROLE', 'role', [row('A', 5, 2), row('B', 2, 2)])).toBeNull();
    expect(strongest('STRONGEST_ROLE', 'role', [row('A', 5, 2), row('B', 5, 2)])).toBeNull();
  });

  it('describes match alignment and recurring gaps without outcome claims', () => {
    const report = buildReport(
      data(
        [1, 2, 3, 4, 5].map((i) => app(['APPLIED'], { matchScore: i <= 2 ? 90 : 40 })),
        {
          targetJobs: [1, 2, 3].map((i) => ({
            jobId: `t${i}`,
            skills: [
              { name: 'Kubernetes', importance: 'REQUIRED' as const, status: 'MISSING' as const },
            ],
          })),
        },
      ),
      NOW,
    );
    const kinds = report.patterns.map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['MATCH_ALIGNMENT', 'RECURRING_GAPS', 'FREQUENT_SKILLS']),
    );
    expect(report.patterns.find((p) => p.kind === 'MATCH_ALIGNMENT')!.finding).toBe(
      '40% of your 5 scored applications were to jobs where the resume you used scored 65 or higher.',
    );
    for (const p of report.patterns) expect(p.finding).not.toMatch(/guarantee|will get/i);
  });

  it('summarises recorded rejection categories once there are enough', () => {
    const apps = ['SKILLS_MISMATCH', 'SKILLS_MISMATCH', 'POSITION_FILLED'].map((c) =>
      app(['APPLIED', 'REJECTED'], {
        rejectionCategory: c as ApplicationRecord['rejectionCategory'],
      }),
    );
    const r = buildReport(data(apps), NOW);
    expect(buildPatterns(r).find((p) => p.kind === 'REJECTION_CATEGORIES')!.finding).toBe(
      'Of the 3 rejections with a recorded reason, 2 were “Skills didn’t match”.',
    );
  });
});
