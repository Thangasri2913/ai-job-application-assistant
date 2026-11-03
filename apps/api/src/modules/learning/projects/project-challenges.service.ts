import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ProjectChallengeDetail,
  ProjectChallengesResponse,
  ProjectChallengeSummary,
  ProjectProgress,
  ReadinessOverview,
  UpdateProjectProgressRequest,
} from '@job-assist/shared';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  PROJECT_CHALLENGES,
  type ProjectChallengeSource,
} from '../catalogue/project-challenges.js';
import { LearningService, learningNotFound } from '../learning.service.js';

interface ProgressRow {
  challengeId: string;
  status: ProjectProgress['status'];
  checkedItemIds: string[];
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

const NOT_STARTED: ProjectProgress = {
  status: 'NOT_STARTED',
  checkedItemIds: [],
  startedAt: null,
  completedAt: null,
  updatedAt: null,
  verification: 'SELF_REPORTED',
};

/**
 * Project challenges (ADR-0023). Progress is self-reported and owned by the authenticated
 * user; JobAssist never runs, uploads or inspects project code.
 */
@Injectable()
export class ProjectChallengesService {
  private readonly byId = new Map(PROJECT_CHALLENGES.map((c) => [c.id, c]));

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: LearningService,
  ) {}

  async list(
    userId: string,
    filter: { courseId?: string; skill?: string },
  ): Promise<ProjectChallengesResponse> {
    if (filter.courseId) this.catalogue.get(filter.courseId);
    const challenges = PROJECT_CHALLENGES.filter(
      (c) =>
        (!filter.courseId || c.courseIds.includes(filter.courseId)) &&
        (!filter.skill || c.skillIds.includes(filter.skill)),
    );
    const rows = await this.rows(userId);
    return { challenges: challenges.map((c) => this.toSummary(c, rows.get(c.id))) };
  }

  async get(userId: string, challengeId: string): Promise<ProjectChallengeDetail> {
    const challenge = this.challenge(challengeId);
    const row = (await this.rows(userId, challengeId)).get(challengeId);
    return this.toDetail(challenge, row);
  }

  async update(
    userId: string,
    challengeId: string,
    request: UpdateProjectProgressRequest,
  ): Promise<ProjectChallengeDetail> {
    const challenge = this.challenge(challengeId);
    const allowed = new Set(
      [...challenge.acceptanceCriteria, ...challenge.selfReview].map((i) => i.id),
    );
    const checked = [...new Set(request.checkedItemIds)];
    if (checked.some((id) => !allowed.has(id)))
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        'The progress refers to checklist items that are not in this challenge.',
      );
    const missing = challenge.acceptanceCriteria.filter((c) => !checked.includes(c.id));
    if (request.status === 'COMPLETED' && missing.length)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        `Tick every acceptance criterion before marking the project complete (${missing.length} left).`,
      );

    const existing = (await this.rows(userId, challengeId)).get(challengeId);
    const now = new Date();
    const startedAt = request.status === 'NOT_STARTED' ? null : (existing?.startedAt ?? now);
    const completedAt = request.status === 'COMPLETED' ? (existing?.completedAt ?? now) : null;
    const row = await this.prisma.learningProjectProgress.upsert({
      where: { userId_challengeId: { userId, challengeId } },
      create: {
        userId,
        challengeId,
        status: request.status,
        checkedItemIds: checked,
        startedAt,
        completedAt,
      },
      update: { status: request.status, checkedItemIds: checked, startedAt, completedAt },
    });
    return this.toDetail(challenge, row);
  }

  /** Started or completed challenges, for the dashboard. */
  async overview(userId: string): Promise<ReadinessOverview['projects']> {
    const rows = await this.rows(userId);
    return [...rows.values()]
      .filter((r) => r.status !== 'NOT_STARTED' && this.byId.has(r.challengeId))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((r) => {
        const c = this.byId.get(r.challengeId)!;
        return {
          challengeId: c.id,
          title: c.title,
          status: r.status,
          checked: r.checkedItemIds.filter((id) => c.acceptanceCriteria.some((a) => a.id === id))
            .length,
          total: c.acceptanceCriteria.length,
          updatedAt: r.updatedAt.toISOString(),
        };
      });
  }

  /** Challenges practising a skill. */
  forSkill(skillId: string): { id: string; title: string }[] {
    return PROJECT_CHALLENGES.filter((c) => c.skillIds.includes(skillId)).map((c) => ({
      id: c.id,
      title: c.title,
    }));
  }

  private challenge(challengeId: string): ProjectChallengeSource {
    const challenge = this.byId.get(challengeId);
    if (!challenge) throw learningNotFound('Project challenge');
    return challenge;
  }

  private async rows(userId: string, challengeId?: string): Promise<Map<string, ProgressRow>> {
    const rows = await this.prisma.learningProjectProgress.findMany({
      where: { userId, ...(challengeId ? { challengeId } : {}) },
      select: {
        challengeId: true,
        status: true,
        checkedItemIds: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    });
    return new Map(rows.map((r) => [r.challengeId, r]));
  }

  private progress(row: ProgressRow | undefined): ProjectProgress {
    if (!row) return NOT_STARTED;
    return {
      status: row.status,
      checkedItemIds: row.checkedItemIds,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      verification: 'SELF_REPORTED',
    };
  }

  private toSummary(
    c: ProjectChallengeSource,
    row: ProgressRow | undefined,
  ): ProjectChallengeSummary {
    return {
      id: c.id,
      title: c.title,
      summary: c.summary,
      difficulty: c.difficulty,
      estimatedHours: c.estimatedHours,
      skills: c.skillIds.map((id) => ({
        id,
        name: this.catalogue.index.skillById.get(id)?.name ?? id,
      })),
      courseIds: c.courseIds,
      provenance: c.provenance,
      progress: this.progress(row),
    };
  }

  private toDetail(
    c: ProjectChallengeSource,
    row: ProgressRow | undefined,
  ): ProjectChallengeDetail {
    return {
      ...this.toSummary(c, row),
      objective: c.objective,
      expectedOutcome: c.expectedOutcome,
      prerequisites: c.prerequisites,
      requirements: c.requirements,
      acceptanceCriteria: c.acceptanceCriteria,
      steps: c.steps,
      testCases: c.testCases,
      selfReview: c.selfReview,
      extensions: c.extensions,
    };
  }
}
