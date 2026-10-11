import { Injectable } from '@nestjs/common';
import type { DashboardSummary, ProfileCompletion } from '@job-assist/shared';
import { ApplicationsService } from '../applications/applications.service.js';
import { RecommendationsService } from '../job-discovery/recommendations.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { computeProfileCompletion } from './profile-completion.js';

/** Read-only aggregates computed from the user's real data. Never estimates or pads values. */
@Injectable()
export class OverviewService {
  constructor(
    private readonly profile: ProfileService,
    private readonly resumes: ResumesService,
    private readonly applications: ApplicationsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  async profileCompletion(userId: string): Promise<ProfileCompletion> {
    const [profile, active] = await Promise.all([
      this.profile.getProfile(userId),
      this.resumes.list(userId, { status: 'ACTIVE', sort: 'updated' }),
    ]);
    return computeProfileCompletion(profile, active.length);
  }

  async dashboard(userId: string): Promise<DashboardSummary> {
    const [profile, all, applications, recommendations] = await Promise.all([
      this.profile.getProfile(userId),
      this.resumes.list(userId, { status: 'ALL', sort: 'updated' }),
      this.applications.pipeline(userId),
      this.recommendations.overview(userId),
    ]);
    const active = all.filter((r) => r.status === 'ACTIVE');
    const defaultResume = all.find((r) => r.isDefault);
    // A resume needs review when its newest version was extracted but not yet confirmed.
    const needsReview = active.filter(
      (r) => r.latestVersion?.parseStatus === 'NEEDS_REVIEW',
    ).length;
    const recentlyUpdated = [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const latestUpload = all
      .filter((r) => r.latestVersion?.source === 'UPLOAD')
      .sort((a, b) => b.latestVersion!.createdAt.localeCompare(a.latestVersion!.createdAt))[0];
    return {
      resumes: {
        total: all.length,
        active: active.length,
        archived: all.length - active.length,
        defaultResume: defaultResume ? { id: defaultResume.id, name: defaultResume.name } : null,
        needsReview,
        latestUpload: latestUpload
          ? {
              id: latestUpload.id,
              name: latestUpload.name,
              uploadedAt: latestUpload.latestVersion!.createdAt,
            }
          : null,
        recentlyUpdated: recentlyUpdated
          ? {
              id: recentlyUpdated.id,
              name: recentlyUpdated.name,
              updatedAt: recentlyUpdated.updatedAt,
            }
          : null,
      },
      profileCompletion: computeProfileCompletion(profile, active.length),
      applications,
      recommendations,
    };
  }
}
