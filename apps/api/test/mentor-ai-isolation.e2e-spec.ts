import { MENTOR_COMPOSE_TASK } from '@job-assist/career-mentor-agent';
import type { MentorResponse } from '@job-assist/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PrismaService } from '../src/database/prisma.service.js';
import { AI_PROVIDER } from '../src/modules/ai/ai-provider.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { MockAiProvider } from '../src/modules/ai/providers/mock-ai.provider.js';
import { PreparationAi } from '../src/modules/application-preparation/ai/preparation-ai.js';
import { CareerInsightsAi } from '../src/modules/career-intelligence/insights/insights-ai.js';
import { InterviewAi } from '../src/modules/interviews/ai/interview-ai.js';
import { JobAiAnalyzer } from '../src/modules/jobs/analysis/job-ai-analyzer.js';
import { JobAnalysisDispatcher } from '../src/modules/jobs/analysis/job-analysis-dispatcher.js';
import { PracticeActivityGenerator } from '../src/modules/learning/ai/practice-activity-generator.js';
import { MENTOR_AI_PROVIDER, MENTOR_AI_SERVICE } from '../src/modules/mentor/mentor-ai.provider.js';
import { ParsingDispatcher } from '../src/modules/resumes/parsing/parsing-dispatcher.js';
import { ResumeAiStructurer } from '../src/modules/resumes/parsing/resume-ai-structurer.js';
import { createTestApp, resetDatabase } from './create-test-app.js';
import { signUp } from './support/api-client.js';
import { ANGULAR_CONTENT, ANGULAR_JOB, createReviewedResume } from './support/job-fixtures.js';

/** Every other AI feature, as the DI container wired it. */
const OTHER_AI_FEATURES = [
  ResumeAiStructurer,
  JobAiAnalyzer,
  PreparationAi,
  InterviewAi,
  CareerInsightsAi,
  PracticeActivityGenerator,
] as const;
const aiOf = (app: NestExpressApplication, feature: (typeof OTHER_AI_FEATURES)[number]) =>
  app.get<unknown, { ai: AiService }>(feature, { strict: false }).ai;

describe('Career Mentor AI provider isolation (e2e)', () => {
  describe('defaults (MENTOR_AI_PROVIDER and AI_PROVIDER unset → none)', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      ({ app } = await createTestApp());
    });
    afterAll(async () => {
      await app.close();
    });

    it('wires a separate, disabled mentor AiService and makes no provider call', async () => {
      const mentorAi = app.get<AiService>(MENTOR_AI_SERVICE, { strict: false });
      const mentorProvider = app.get<{ generateStructured: () => unknown }>(MENTOR_AI_PROVIDER, {
        strict: false,
      });
      const globalAi = app.get(AiService, { strict: false });
      expect(mentorAi).not.toBe(globalAi);
      expect(mentorAi.providerName).toBe('none');
      expect(globalAi.providerName).toBe('none');

      const call = vi.spyOn(mentorProvider, 'generateStructured');
      const user = await signUp(app, 'Default mentor user');
      const res = (await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200))
        .body as MentorResponse;
      expect(res).toMatchObject({ source: 'RULES', fallbackReason: 'AI_DISABLED' });
      expect(call).not.toHaveBeenCalled();
    });
  });

  describe('mentor provider enabled (mock), global provider left at none', () => {
    let app: NestExpressApplication;
    let prisma: PrismaService;
    let mentorProvider: MockAiProvider;

    beforeAll(async () => {
      // Responds to any task, so a leak into another feature would show up as a request.
      mentorProvider = new MockAiProvider()
        .respondTo(MENTOR_COMPOSE_TASK, { picks: ['R1'] })
        .respondTo('resume.structure', {})
        .respondTo('job.analyze', {});
      ({ app, prisma } = await createTestApp({ mentorAiProvider: mentorProvider }));
      await resetDatabase(prisma);
    });
    afterAll(async () => {
      await app.close();
    });

    it('gives every other AI feature the shared, disabled AiService — never the mentor’s', () => {
      const mentorAi = app.get<AiService>(MENTOR_AI_SERVICE, { strict: false });
      expect(mentorAi.providerName).toBe('mock');
      expect(app.get(AI_PROVIDER, { strict: false })).not.toBe(mentorProvider);
      for (const feature of OTHER_AI_FEATURES) {
        const ai = aiOf(app, feature);
        expect(ai, feature.name).toBe(app.get(AiService, { strict: false }));
        expect(ai, feature.name).not.toBe(mentorAi);
        expect(ai.enabled, feature.name).toBe(false);
      }
    });

    it('uses the mentor provider for the mentor only; resume parsing and job analysis stay rule-based', async () => {
      const user = await signUp(app, 'Isolation user');
      await createReviewedResume(user, app.get(ParsingDispatcher), 'CV', ANGULAR_CONTENT);
      const jobId = ((await user.post('/jobs', ANGULAR_JOB).expect(201)).body as { id: string }).id;
      await user.post(`/jobs/${jobId}/analyze`).expect(202);
      await app.get(JobAnalysisDispatcher).drain();
      expect(mentorProvider.requests).toHaveLength(0);

      const res = (await user.post('/mentor/ask', { intent: 'GENERAL_PROGRESS' }).expect(200))
        .body as MentorResponse;
      expect(res).toMatchObject({ source: 'AI', fallbackReason: null });
      expect(mentorProvider.requests.map((r) => r.task)).toEqual([MENTOR_COMPOSE_TASK]);
      // Usage is recorded under the mentor operation only.
      const usage = await prisma.aiUsage.findMany({ where: { userId: user.userId } });
      expect(usage.map((u) => u.operation)).toEqual([MENTOR_COMPOSE_TASK]);
    });
  });
});
