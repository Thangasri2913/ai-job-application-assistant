import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { JobAnalysisService } from '../jobs/analysis/job-analysis.service.js';
import { ProfileService } from '../profile/profile.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import { buildVerifiedFacts } from './grounding.js';
import type { PreparationContext } from './preparation-context.js';

const conflict = (code: ErrorCode, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);

/**
 * Builds the generation context for one application from the signed-in user's own data only:
 * the application's exact resume version, the career profile, the job's stored requirements
 * and the deterministic match. Shared by application preparation and interview preparation.
 */
@Injectable()
export class PreparationContextLoader {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly resumes: ResumesService,
    private readonly jobAnalysis: JobAnalysisService,
    private readonly profile: ProfileService,
  ) {}

  /** `resumeVersionId` overrides the application's (e.g. an interview session's stored version). */
  async load(
    userId: string,
    applicationId: string,
    resumeVersionId?: string,
  ): Promise<PreparationContext> {
    const target = await this.applications.getPreparationTarget(userId, applicationId);
    const versionId = resumeVersionId ?? target.resumeVersionId;
    const version = await this.resumes.getVersionContent(userId, versionId);
    if (!version?.content) {
      throw conflict(
        ErrorCode.RESUME_CONTENT_MISSING,
        'The resume version used for this application has no structured content to work from.',
      );
    }
    const [profile, analysis] = await Promise.all([
      this.profile.getProfile(userId),
      this.jobAnalysis
        .getMatchContext(userId, target.jobId, versionId, version.content, new Date())
        .catch((error: unknown) => {
          if (error instanceof AppException && error.code === ErrorCode.ANALYSIS_NOT_AVAILABLE) {
            throw conflict(
              ErrorCode.ANALYSIS_NOT_AVAILABLE,
              'Analyse the job first, so preparation can use its requirements.',
            );
          }
          throw error;
        }),
    ]);
    return {
      userId,
      applicationId,
      candidateName: version.content.contact.fullName ?? profile.details.fullName,
      job: analysis.job,
      resume: {
        resumeId: version.resumeId,
        resumeName: version.resumeName,
        resumeVersionId: versionId,
        versionNumber: version.versionNumber,
        content: version.content,
      },
      profile,
      match: analysis.match,
      facts: buildVerifiedFacts(version.content, profile),
    };
  }
}
