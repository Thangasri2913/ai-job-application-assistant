import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { LearningModule } from '../learning/learning.module.js';
import { MentorController } from './mentor.controller.js';
import { mentorAiProviders } from './mentor-ai.provider.js';
import { MentorAiBudget } from './mentor-ai-budget.service.js';
import { MentorService } from './mentor.service.js';
import { MentorTools } from './mentor-tools.js';

/**
 * AiModule is imported for AiUsageService only. The mentor's model connection comes from
 * mentorAiProviders (MENTOR_AI_PROVIDER), which are deliberately not exported.
 */
@Module({
  imports: [LearningModule, AiModule],
  controllers: [MentorController],
  providers: [MentorService, MentorTools, MentorAiBudget, ...mentorAiProviders],
})
export class MentorModule {}
