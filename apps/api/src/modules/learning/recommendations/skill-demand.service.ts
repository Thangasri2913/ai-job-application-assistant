import { Injectable } from '@nestjs/common';
import type { LearningRole, SkillDemandReport } from '@job-assist/shared';
import { PrismaService } from '../../../database/prisma.service.js';
import { ROLES } from '../catalogue/roles.js';
import { createSkillLookup } from '../catalogue/skill-lookup.js';
import { LearningService } from '../learning.service.js';

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLE_PATTERNS = new Map(
  ROLES.map((r) => [
    r.id,
    // Whole words only: "api" must not match "rapid", nor "test" match "contest".
    r.titleKeywords.map((k) => new RegExp(`(^|[^a-z0-9])${escape(k.trim())}($|[^a-z0-9])`, 'i')),
  ]),
);

/** True when a job title names the role, by whole-word keywords. */
export function titleMatchesRole(title: string, role: LearningRole): boolean {
  return (ROLE_PATTERNS.get(role) ?? []).some((pattern) => pattern.test(title));
}

const TOP_SKILLS = 15;

/**
 * Observed skill demand — from the signed-in user's own analysed job postings only. This is
 * real evidence (requirements extracted from postings the user added or discovered) but not a
 * market-wide statistic, and the report says so. Development sample postings are excluded.
 *
 * Further sources (e.g. an authorised job-market data provider) can be added as additional
 * reports with their own `source`, without changing the catalogue.
 */
@Injectable()
export class SkillDemandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
  ) {}

  async forUser(userId: string, role: LearningRole | null): Promise<SkillDemandReport> {
    const jobs = await this.prisma.job.findMany({
      where: { userId, currentAnalysisId: { not: null } },
      select: {
        title: true,
        isSampleData: true,
        currentAnalysis: {
          select: {
            completedAt: true,
            requirements: {
              where: { type: 'SKILL' },
              select: { name: true, normalizedName: true, importance: true },
            },
          },
        },
      },
    });

    const matchesRole = (title: string) => !role || titleMatchesRole(title, role);

    const real = jobs.filter((j) => !j.isSampleData);
    const relevant = real.filter((j) => matchesRole(j.title));
    const excludedSampleJobs = jobs.filter((j) => j.isSampleData && matchesRole(j.title)).length;

    const counts = new Map<
      string,
      { name: string; postings: number; requiredIn: number; preferredIn: number }
    >();
    const dates: Date[] = [];
    for (const job of relevant) {
      if (job.currentAnalysis?.completedAt) dates.push(job.currentAnalysis.completedAt);
      const seen = new Set<string>();
      for (const r of job.currentAnalysis?.requirements ?? []) {
        const key = r.normalizedName;
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = counts.get(key) ?? {
          name: r.name,
          postings: 0,
          requiredIn: 0,
          preferredIn: 0,
        };
        entry.postings += 1;
        if (r.importance === 'REQUIRED') entry.requiredIn += 1;
        else entry.preferredIn += 1;
        counts.set(key, entry);
      }
    }

    const lookup = createSkillLookup(this.catalogue.index.skillById.values());

    const skills = [...counts.entries()]
      .sort((a, b) => b[1].postings - a[1].postings || a[1].name.localeCompare(b[1].name))
      .slice(0, TOP_SKILLS)
      .map(([key, c]) => {
        const skillId = lookup(key) ?? lookup(c.name);
        return {
          ...c,
          skillId,
          courseIds: skillId
            ? (this.catalogue.index.skills.find((s) => s.id === skillId)?.courseIds ?? [])
            : [],
        };
      });

    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const limitations = [
      'Counts come only from job postings you analysed in JobAssist, not from the wider job market.',
      'A small number of postings can be unrepresentative; requirements vary by employer, seniority and region.',
    ];
    if (role)
      limitations.push(
        'Postings are matched to the role by keywords in their titles, which can miss or include some jobs.',
      );
    if (relevant.length === 0)
      limitations.push(
        role
          ? 'None of your analysed jobs match this role yet. Analyse a few postings to see observed demand.'
          : 'You have no analysed jobs yet. Analyse a few postings to see observed demand.',
      );
    if (excludedSampleJobs > 0)
      limitations.push(`${excludedSampleJobs} development sample posting(s) were excluded.`);

    return {
      source: 'YOUR_ANALYSED_JOBS',
      role,
      jobCount: relevant.length,
      excludedSampleJobs,
      observedFrom: sorted[0]?.toISOString().slice(0, 10) ?? null,
      observedTo: sorted.at(-1)?.toISOString().slice(0, 10) ?? null,
      skills,
      limitations,
    };
  }
}
