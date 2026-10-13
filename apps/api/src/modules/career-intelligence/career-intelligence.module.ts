import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CareerDataLoader } from './career-data.loader.js';
import { CareerInsightsDispatcher } from './career-insights-dispatcher.js';
import { CareerInsightsService } from './career-insights.service.js';
import { CareerIntelligenceController } from './career-intelligence.controller.js';
import { CareerIntelligenceService } from './career-intelligence.service.js';
import { InProcessCareerInsightsDispatcher } from './in-process-career-insights-dispatcher.js';
import { CareerInsightsAi } from './insights/insights-ai.js';

/**
 * Career intelligence (ADR-0019): read-only analytics over applications, jobs, matches and
 * interviews, plus stored, evidence-based insights. It never writes another module's tables;
 * it owns career_insight_runs and career_insights.
 */
@Module({
  imports: [AiModule],
  controllers: [CareerIntelligenceController],
  providers: [
    CareerDataLoader,
    CareerIntelligenceService,
    CareerInsightsService,
    CareerInsightsAi,
    { provide: CareerInsightsDispatcher, useClass: InProcessCareerInsightsDispatcher },
  ],
})
export class CareerIntelligenceModule {}
