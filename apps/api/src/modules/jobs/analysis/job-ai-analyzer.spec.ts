import { AiService } from '../../ai/ai.service.js';
import { MockAiProvider } from '../../ai/providers/mock-ai.provider.js';
import { UnconfiguredAiProvider } from '../../ai/providers/unconfigured-ai.provider.js';
import { FRONTEND_JOB } from './job-analyzer.spec.js';
import {
  groundJobAnalysis,
  JOB_ANALYSIS_TASK,
  JobAiAnalyzer,
  type JobAnalysisAiOutput,
} from './job-ai-analyzer.js';

const job = { title: 'Frontend Developer', companyName: 'Example Corp', description: FRONTEND_JOB };

const valid: JobAnalysisAiOutput = {
  summary: 'Frontend role building SaaS analytics dashboards.',
  requiredSkills: [
    { name: 'Angular', evidence: 'Strong experience with Angular, TypeScript and RxJS' },
    { name: 'Kubernetes', evidence: 'Must know Kubernetes' }, // not in the posting
  ],
  preferredSkills: [{ name: 'React.js', evidence: 'React.js or Vue' }],
  requiredExperience: [
    {
      text: '3+ years',
      evidence: '3+ years of professional experience in frontend development',
      minYears: 3,
    },
  ],
  educationRequirements: [],
  responsibilities: [{ text: 'Build UI', evidence: 'Optimize application performance' }],
  otherRequirements: [
    { text: 'Leadership', evidence: 'Led a team of 10 engineers', importance: 'REQUIRED' },
  ],
  keywords: ['SaaS', 'Blockchain'],
  seniority: 'MID',
  employmentType: 'FULL_TIME',
  confidence: 0.9,
};

describe('groundJobAnalysis', () => {
  it('keeps only items whose skill and evidence occur in the description', () => {
    const { requirements, keywords, removed } = groundJobAnalysis(valid, FRONTEND_JOB);
    expect(
      requirements.filter((r) => r.type === 'SKILL').map((r) => [r.name, r.importance]),
    ).toEqual([
      ['Angular', 'REQUIRED'],
      ['React', 'PREFERRED'],
    ]);
    expect(requirements.find((r) => r.type === 'EXPERIENCE')?.minYears).toBe(3);
    expect(requirements.some((r) => r.type === 'OTHER')).toBe(false);
    expect(keywords).toEqual(['SaaS']);
    expect(removed).toBe(3); // Kubernetes, the invented "Led a team", Blockchain
    expect(requirements.every((r) => r.detectedBy === 'AI')).toBe(true);
  });
});

describe('JobAiAnalyzer', () => {
  it('is disabled without a provider', async () => {
    const analyzer = new JobAiAnalyzer(new AiService(new UnconfiguredAiProvider()));
    expect(await analyzer.analyze(job)).toBeNull();
  });

  it('returns validated, grounded output', async () => {
    const provider = new MockAiProvider().respondTo(JOB_ANALYSIS_TASK, valid);
    const result = await new JobAiAnalyzer(new AiService(provider)).analyze(job);
    expect(result).toMatchObject({ status: 'VALID', attempts: 1, removedUngroundedItems: 3 });
    expect(provider.requests[0]!.system).toMatch(/Do not invent requirements/);
    expect(provider.requests[0]!.system).toMatch(
      /Do not estimate hiring chances or ATS compatibility/,
    );
  });

  it('retries malformed output once, then reports INVALID and keeps nothing', async () => {
    const provider = new MockAiProvider().respondTo(JOB_ANALYSIS_TASK, {
      summary: 42,
      requiredSkills: 'Angular',
    });
    const result = await new JobAiAnalyzer(new AiService(provider)).analyze(job);
    expect(result).toEqual({
      status: 'INVALID',
      provider: 'mock',
      promptVersion: 'job-analysis@1',
      attempts: 2,
      reason: expect.stringMatching(/discarded/),
    });
    expect(provider.requests).toHaveLength(2);
  });

  it('reports provider failures without retrying', async () => {
    const provider = new MockAiProvider(); // no response registered → provider error
    const result = await new JobAiAnalyzer(new AiService(provider)).analyze(job);
    expect(result).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(provider.requests).toHaveLength(1);
  });
});
