import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ProfileModule } from '../profile/profile.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { InProcessJobAnalysisDispatcher } from './analysis/in-process-job-analysis-dispatcher.js';
import { JobAiAnalyzer } from './analysis/job-ai-analyzer.js';
import { JobAnalysisDispatcher } from './analysis/job-analysis-dispatcher.js';
import { JobAnalysisService } from './analysis/job-analysis.service.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

/**
 * Job intake, analysis and resume matching (ADR-0014). Reads resumes and the profile only
 * through their exported services; owns jobs, job_analyses, job_requirements,
 * match_analyses and resume_recommendations.
 */
@Module({
  imports: [AiModule, ProfileModule, ResumesModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobAnalysisService,
    JobAiAnalyzer,
    { provide: JobAnalysisDispatcher, useClass: InProcessJobAnalysisDispatcher },
  ],
  exports: [JobAnalysisService, JobsService],
})
export class JobsModule {}
