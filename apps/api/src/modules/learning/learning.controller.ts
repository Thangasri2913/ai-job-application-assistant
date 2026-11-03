import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  ActivityAttemptResult,
  DismissNextStepRequest,
  LearningPreferences,
  NextStepsResponse,
  RevisionQueueResponse,
  UpdateLearningPreferencesRequest,
  AnalysedJobsResponse,
  InterviewFeedback,
  InterviewPracticeQuestionsResponse,
  InterviewQuestionDetail,
  JobReadinessRequest,
  JobReadinessResponse,
  ProjectChallengeDetail,
  ProjectChallengesResponse,
  SubmitInterviewAnswerRequest,
  UpdateProjectProgressRequest,
  CourseCatalogueResponse,
  CourseDetail,
  CourseProgress,
  DiagnosticAssessment,
  DiagnosticResult,
  LearningDashboard,
  LearningRecommendationRequest,
  LearningRecommendationResponse,
  LearningRolesResponse,
  LearningSkillsResponse,
  SkillDemandReport,
  SubmitActivityAttemptRequest,
  SubmitDiagnosticRequest,
} from '@job-assist/shared';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import {
  learningRecommendationSchema,
  ListCoursesQueryDto,
  submitActivityAttemptSchema,
  submitDiagnosticSchema,
} from './dto/learning.dto.js';
import { LearningProgressService } from './learning-progress.service.js';
import { LearningService } from './learning.service.js';
import { LearningRecommendationsService } from './recommendations/learning-recommendations.service.js';
import { SkillDemandService } from './recommendations/skill-demand.service.js';
import { ListSkillDemandQueryDto } from './dto/skill-demand.dto.js';
import {
  jobReadinessSchema,
  ListInterviewQuestionsQueryDto,
  ListProjectChallengesQueryDto,
  submitInterviewAnswerSchema,
  updateProjectProgressSchema,
} from './dto/practice.dto.js';
import { AdaptiveLearningService } from './adaptive/adaptive-learning.service.js';
import { dismissNextStepSchema, updateLearningPreferencesSchema } from './dto/adaptive.dto.js';
import { InterviewPracticeService } from './interview/interview-practice.service.js';
import { ProjectChallengesService } from './projects/project-challenges.service.js';
import { JobReadinessService } from './readiness/job-readiness.service.js';
import { LearningDashboardService } from './readiness/learning-dashboard.service.js';

/**
 * Learn & Prepare (ADR-0021, ADR-0022). The catalogue is the same for every signed-in user;
 * progress, assessments and recommendations always belong to the authenticated user. Ids in
 * paths are catalogue ids — malformed or unknown ones are 404.
 */
@ApiTags('learning')
@ApiBearerAuth()
@Controller('learning')
export class LearningController {
  constructor(
    private readonly catalogue: LearningService,
    private readonly progress: LearningProgressService,
    private readonly recommendations: LearningRecommendationsService,
    private readonly demand: SkillDemandService,
    private readonly interview: InterviewPracticeService,
    private readonly projects: ProjectChallengesService,
    private readonly jobReadiness: JobReadinessService,
    private readonly dashboards: LearningDashboardService,
    private readonly adaptive: AdaptiveLearningService,
  ) {}

  // ── Catalogue ──

  @Get('courses')
  list(@Query() query: ListCoursesQueryDto): CourseCatalogueResponse {
    return this.catalogue.list(query);
  }

  @Get('courses/:courseId')
  get(@Param('courseId') courseId: string): CourseDetail {
    return this.catalogue.get(courseId);
  }

  @Get('skills')
  skills(): LearningSkillsResponse {
    return this.catalogue.skills();
  }

  @Get('roles')
  roles(): LearningRolesResponse {
    return this.catalogue.roles();
  }

  @Get('courses/:courseId/diagnostic')
  diagnostic(@Param('courseId') courseId: string): DiagnosticAssessment {
    return this.catalogue.diagnostic(courseId);
  }

  // ── Progress (the authenticated user's own) ──

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser): Promise<LearningDashboard> {
    return this.dashboards.dashboard(user.userId);
  }

  @Get('courses/:courseId/progress')
  courseProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseProgress> {
    return this.progress.courseProgress(user.userId, courseId);
  }

  @Put('enrollments/:courseId')
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ): Promise<CourseProgress> {
    return this.progress.enroll(user.userId, courseId);
  }

  @Delete('enrollments/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unenroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
  ): Promise<void> {
    return this.progress.unenroll(user.userId, courseId);
  }

  @Put('courses/:courseId/lessons/:lessonId/completion')
  completeLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ): Promise<CourseProgress> {
    return this.progress.completeLesson(user.userId, courseId, lessonId);
  }

  @Delete('courses/:courseId/lessons/:lessonId/completion')
  uncompleteLesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
  ): Promise<CourseProgress> {
    return this.progress.uncompleteLesson(user.userId, courseId, lessonId);
  }

  @Post('courses/:courseId/activities/:activityId/attempts')
  submitActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Param('activityId') activityId: string,
    @Body(new ZodValidationPipe(submitActivityAttemptSchema)) body: SubmitActivityAttemptRequest,
  ): Promise<ActivityAttemptResult> {
    return this.progress.submitActivity(user.userId, courseId, activityId, body.answer);
  }

  @Post('courses/:courseId/diagnostic/attempts')
  submitDiagnostic(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId') courseId: string,
    @Body(new ZodValidationPipe(submitDiagnosticSchema)) body: SubmitDiagnosticRequest,
  ): Promise<DiagnosticResult> {
    return this.progress.submitDiagnostic(user.userId, courseId, body);
  }

  // ── Recommendations ──

  @Post('recommendations')
  @HttpCode(HttpStatus.OK)
  recommend(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(learningRecommendationSchema)) body: LearningRecommendationRequest,
  ): Promise<LearningRecommendationResponse> {
    return this.recommendations.recommend(user.userId, body);
  }

  @Get('skill-demand')
  skillDemand(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSkillDemandQueryDto,
  ): Promise<SkillDemandReport> {
    return this.demand.forUser(user.userId, query.role ?? null);
  }

  // ── Interview practice (ADR-0023) ──

  @Get('interview/questions')
  interviewQuestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListInterviewQuestionsQueryDto,
  ): Promise<InterviewPracticeQuestionsResponse> {
    return this.interview.list(user.userId, query);
  }

  @Get('interview/questions/:questionId')
  interviewQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId') questionId: string,
  ): Promise<InterviewQuestionDetail> {
    return this.interview.get(user.userId, questionId);
  }

  @Post('interview/questions/:questionId/attempts')
  submitInterviewAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionId') questionId: string,
    @Body(new ZodValidationPipe(submitInterviewAnswerSchema)) body: SubmitInterviewAnswerRequest,
  ): Promise<InterviewFeedback> {
    return this.interview.submit(user.userId, questionId, body.answer);
  }

  // ── Project challenges (ADR-0023) ──

  @Get('projects')
  projectChallenges(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProjectChallengesQueryDto,
  ): Promise<ProjectChallengesResponse> {
    return this.projects.list(user.userId, query);
  }

  @Get('projects/:challengeId')
  projectChallenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string,
  ): Promise<ProjectChallengeDetail> {
    return this.projects.get(user.userId, challengeId);
  }

  @Put('projects/:challengeId/progress')
  updateProjectProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('challengeId') challengeId: string,
    @Body(new ZodValidationPipe(updateProjectProgressSchema)) body: UpdateProjectProgressRequest,
  ): Promise<ProjectChallengeDetail> {
    return this.projects.update(user.userId, challengeId, body);
  }

  // ── Job readiness (ADR-0023) ──

  @Get('jobs')
  analysedJobs(@CurrentUser() user: AuthenticatedUser): Promise<AnalysedJobsResponse> {
    return this.jobReadiness.jobs(user.userId);
  }

  @Post('job-readiness')
  @HttpCode(HttpStatus.OK)
  readiness(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(jobReadinessSchema)) body: JobReadinessRequest,
  ): Promise<JobReadinessResponse> {
    return this.jobReadiness.readiness(user.userId, body);
  }

  // ── Adaptive learning (ADR-0024) ──

  @Get('next-steps')
  nextSteps(@CurrentUser() user: AuthenticatedUser): Promise<NextStepsResponse> {
    return this.adaptive.nextSteps(user.userId);
  }

  @Post('next-steps/dismissals')
  @HttpCode(HttpStatus.OK)
  dismissNextStep(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(dismissNextStepSchema)) body: DismissNextStepRequest,
  ): Promise<LearningPreferences> {
    return this.adaptive.dismiss(user.userId, body.key);
  }

  @Delete('next-steps/dismissals')
  restoreDismissedSteps(@CurrentUser() user: AuthenticatedUser): Promise<LearningPreferences> {
    return this.adaptive.restoreDismissed(user.userId);
  }

  @Get('revision')
  revision(@CurrentUser() user: AuthenticatedUser): Promise<RevisionQueueResponse> {
    return this.adaptive.revision(user.userId);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser): Promise<LearningPreferences> {
    return this.adaptive.getPreferences(user.userId);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateLearningPreferencesSchema))
    body: UpdateLearningPreferencesRequest,
  ): Promise<LearningPreferences> {
    return this.adaptive.updatePreferences(user.userId, body);
  }
}
