import { Injectable } from '@nestjs/common';
import type { LearningDashboard, ReadinessOverview } from '@job-assist/shared';
import { PrismaService } from '../../../database/prisma.service.js';
import { AdaptiveLearningService } from '../adaptive/adaptive-learning.service.js';
import { InterviewPracticeService } from '../interview/interview-practice.service.js';
import { LearningProgressService } from '../learning-progress.service.js';
import { LearningService } from '../learning.service.js';
import { ProjectChallengesService } from '../projects/project-challenges.service.js';

/** Share of correct diagnostic answers below which a measured skill still needs practice. */
const DEMONSTRATED_RATIO = 0.8;

/**
 * The single learning dashboard (ADR-0022, extended by ADR-0023 and ADR-0024): course progress,
 * projects, interview practice, skills to practise, real job counts, analytics and the top
 * ranked next step. Indicators are shown separately — never combined into a score.
 */
@Injectable()
export class LearningDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: LearningProgressService,
    private readonly interview: InterviewPracticeService,
    private readonly projects: ProjectChallengesService,
    private readonly adaptive: AdaptiveLearningService,
    private readonly catalogue: LearningService,
  ) {}

  async dashboard(userId: string): Promise<LearningDashboard> {
    const core = await this.progress.dashboard(userId);
    const [projects, interview, realJobs, sampleJobs, snapshot] = await Promise.all([
      this.projects.overview(userId),
      this.interview.overview(userId),
      this.prisma.job.count({
        where: { userId, isSampleData: false, currentAnalysisId: { not: null } },
      }),
      this.prisma.job.count({
        where: { userId, isSampleData: true, currentAnalysisId: { not: null } },
      }),
      this.adaptive.snapshot(userId, core),
    ]);

    const skillsToPractise = core.assessedSkills.flatMap((s) =>
      !s.sufficient
        ? [
            {
              skillId: s.skillId,
              name: s.name,
              reason: `Only ${s.total} diagnostic question${s.total === 1 ? '' : 's'} answered — too few to measure.`,
            },
          ]
        : s.correct / s.total < DEMONSTRATED_RATIO
          ? [
              {
                skillId: s.skillId,
                name: s.name,
                reason: `${s.correct} of ${s.total} correct in the latest diagnostic.`,
              },
            ]
          : [],
    );

    // The revision list follows the revision schedule (ADR-0024), so it matches the revision page.
    const revision = snapshot.dueActivities.flatMap((d) => {
      const course = this.catalogue.index.courseById.get(d.courseId);
      const lesson = (this.catalogue.index.lessonsByCourse.get(d.courseId) ?? []).find(
        (l) => l.lesson.id === d.lessonId,
      )?.lesson;
      const activity = lesson?.activities.find((a) => a.id === d.activityId);
      return course && lesson && activity
        ? [
            {
              courseId: course.id,
              courseTitle: course.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              activityId: activity.id,
              prompt: activity.prompt,
            },
          ]
        : [];
    });

    const top = snapshot.nextSteps.steps[0];
    const readiness: ReadinessOverview = {
      projects,
      interview,
      skillsToPractise,
      jobs: { analysedJobs: realJobs, sampleJobsExcluded: sampleJobs },
      nextAction: top
        ? { kind: top.kind, title: top.title, reason: top.reason, href: top.href }
        : {
            kind: 'START_HERE',
            title: 'Browse the course catalogue',
            reason:
              'You have dismissed the current suggestions. Pick any course you are interested in.',
            href: '/learn',
          },
    };
    return { ...core, revision: revision.slice(0, 20), readiness, analytics: snapshot.analytics };
  }
}
