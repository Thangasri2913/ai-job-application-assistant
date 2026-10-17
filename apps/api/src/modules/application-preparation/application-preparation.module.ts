import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ApplicationsModule } from '../applications/applications.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { PreparationAi } from './ai/preparation-ai.js';
import { ApplicationPreparationController } from './application-preparation.controller.js';
import { ApplicationPreparationService } from './application-preparation.service.js';
import { PreparationContextLoader } from './preparation-context.loader.js';

/**
 * AI application preparation (ADR-0016). Owns application_preparations, resume_suggestions,
 * cover_letter_versions and application_questions; reads applications, resumes, jobs and the
 * profile only through their services.
 */
@Module({
  imports: [AiModule, ApplicationsModule, JobsModule, ProfileModule, ResumesModule],
  controllers: [ApplicationPreparationController],
  providers: [ApplicationPreparationService, PreparationAi, PreparationContextLoader],
  exports: [PreparationContextLoader, ApplicationPreparationService],
})
export class ApplicationPreparationModule {}
