import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ResumesModule } from '../resumes/resumes.module.js';
import { PracticeActivityGenerator } from './ai/practice-activity-generator.js';
import { AdaptiveLearningService } from './adaptive/adaptive-learning.service.js';
import { InterviewPracticeService } from './interview/interview-practice.service.js';
import { LearningProgressService } from './learning-progress.service.js';
import { ProjectChallengesService } from './projects/project-challenges.service.js';
import { JobReadinessService } from './readiness/job-readiness.service.js';
import { LearningDashboardService } from './readiness/learning-dashboard.service.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';
import { LearningRecommendationsService } from './recommendations/learning-recommendations.service.js';
import { SkillDemandService } from './recommendations/skill-demand.service.js';

@Module({
  imports: [ResumesModule, AiModule],
  controllers: [LearningController],
  providers: [
    LearningService,
    LearningProgressService,
    LearningRecommendationsService,
    SkillDemandService,
    PracticeActivityGenerator,
    InterviewPracticeService,
    ProjectChallengesService,
    JobReadinessService,
    LearningDashboardService,
    AdaptiveLearningService,
  ],
  exports: [
    PracticeActivityGenerator,
    // Read by the Career Mentor's tool adapters (apps/api/src/modules/mentor).
    LearningService,
    LearningProgressService,
    LearningRecommendationsService,
    AdaptiveLearningService,
    InterviewPracticeService,
    ProjectChallengesService,
    JobReadinessService,
  ],
})
export class LearningModule {}
