import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ApplicationPreparationModule } from '../application-preparation/application-preparation.module.js';
import { ApplicationsModule } from '../applications/applications.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { InterviewAi } from './ai/interview-ai.js';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

/**
 * Interview preparation and mock interviews (ADR-0017). Owns interview_sessions,
 * interview_questions, interview_answers and interview_evaluations; builds context through
 * the shared PreparationContextLoader.
 */
@Module({
  imports: [AiModule, ApplicationPreparationModule, ApplicationsModule, ResumesModule],
  controllers: [InterviewsController],
  providers: [InterviewsService, InterviewAi],
})
export class InterviewsModule {}
