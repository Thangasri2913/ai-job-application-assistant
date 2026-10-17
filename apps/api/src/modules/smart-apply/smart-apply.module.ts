import { Module } from '@nestjs/common';
import { AppConfigService } from '../../config/config.module.js';
import { ApplicationPreparationModule } from '../application-preparation/application-preparation.module.js';
import { ApplicationsModule } from '../applications/applications.module.js';
import { defaultFetch } from '../job-discovery/sources/http.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { EmployerQuestionsReader } from './employer-questions.js';
import { InProcessSmartApplyWorker } from './in-process-smart-apply-worker.js';
import { SmartApplyDispatcher } from './smart-apply-dispatcher.js';
import { SmartApplyController } from './smart-apply.controller.js';
import {
  SMART_APPLY_OPTIONS,
  SmartApplyService,
  type SmartApplyOptions,
} from './smart-apply.service.js';
import { SUBMISSION_PROVIDERS, type SubmissionProvider } from './submission/submission-provider.js';

/**
 * Smart Apply (ADR-0020): application preparation, missing-answer workflow, handoff to the
 * official site and (only where authorised) automatic submission.
 */
@Module({
  imports: [
    ApplicationsModule,
    ApplicationPreparationModule,
    JobsModule,
    NotificationsModule,
    ProfileModule,
    ResumesModule,
  ],
  controllers: [SmartApplyController],
  providers: [
    SmartApplyService,
    {
      provide: SMART_APPLY_OPTIONS,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): SmartApplyOptions => ({
        autoSubmitEnabled: config.get('SMART_APPLY_AUTO_SUBMIT_ENABLED', { infer: true }),
        maxAttempts: config.get('SMART_APPLY_MAX_SUBMISSION_ATTEMPTS', { infer: true }),
        retryBaseMs: config.get('SMART_APPLY_RETRY_BASE_SECONDS', { infer: true }) * 1000,
      }),
    },
    { provide: SmartApplyDispatcher, useClass: InProcessSmartApplyWorker },
    // No authorised submission integration exists yet: every job is handed off.
    { provide: SUBMISSION_PROVIDERS, useValue: [] satisfies SubmissionProvider[] },
    {
      provide: EmployerQuestionsReader,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new EmployerQuestionsReader(
          defaultFetch,
          config.get('SMART_APPLY_FETCH_EMPLOYER_QUESTIONS', { infer: true }),
        ),
    },
  ],
})
export class SmartApplyModule {}
