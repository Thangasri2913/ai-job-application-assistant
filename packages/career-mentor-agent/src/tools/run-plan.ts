import type { MentorAskRequest, MentorTool } from '@job-assist/shared';
import { MentorAgentError } from '../errors.js';
import { MENTOR_TOOL_PLAN } from '../intents.js';
import { normaliseSnapshot } from '../internal.js';
import type { ComposeInput } from '../rules/compose.js';
import type { Toolbox } from './toolbox.js';

/**
 * Runs the fixed tool plan for the intent, in order, filling the composer's input. A tool that
 * does not apply (e.g. no role for a plan) is skipped and left out of `toolsUsed`.
 */
export async function runToolPlan(
  request: MentorAskRequest,
  toolbox: Readonly<Toolbox>,
  input: ComposeInput,
): Promise<MentorTool[]> {
  const used: MentorTool[] = [];
  for (const tool of MENTOR_TOOL_PLAN[request.intent])
    if (await runTool(tool, request, toolbox, input)) used.push(tool);
  return used;
}

async function runTool(
  tool: MentorTool,
  request: MentorAskRequest,
  tools: Readonly<Toolbox>,
  input: ComposeInput,
): Promise<boolean> {
  const role = () => input.preferences?.targetRole ?? input.hints.role;
  switch (tool) {
    case 'catalogue':
      return true; // read before the plan, to recognise skills in the question
    case 'preferences':
      input.preferences = await tools.preferences();
      return true;
    case 'learning_snapshot':
      input.snapshot = normaliseSnapshot(await tools.learningSnapshot());
      return true;
    case 'skill_assessment': {
      const r = role();
      if (r) {
        input.assessment = {
          role: r,
          skillIds: [],
          result: await tools.skillAssessment({ role: r }),
        };
        return true;
      }
      if (!input.hints.skillIds.length) return false;
      input.assessment = {
        role: null,
        skillIds: input.hints.skillIds,
        result: await tools.skillAssessment({ skillIds: input.hints.skillIds }),
      };
      return true;
    }
    case 'learning_plan': {
      const r = role();
      if (!r) return false;
      input.plan = await tools.learningPlan(r);
      return true;
    }
    case 'interview_practice':
      input.interview = await tools.interviewPractice();
      return true;
    case 'project_challenges':
      input.projects = await tools.projectChallenges();
      return true;
    case 'analysed_jobs':
      input.jobs = await tools.analysedJobs();
      return true;
    case 'job_readiness': {
      const jobs = input.jobs ?? [];
      // Only ids from the user's own analysed jobs are ever passed on; anything else — another
      // user's job or one never analysed — is reported exactly like a missing job.
      if (request.jobId && !jobs.some((j) => j.id === request.jobId))
        throw new MentorAgentError('JOB_NOT_FOUND', 'Job not found among your analysed jobs.');
      const job = request.jobId
        ? jobs.find((j) => j.id === request.jobId)
        : (jobs.find((j) => !j.isSampleData) ?? jobs[0]);
      if (!job) return false;
      input.readiness = await tools.jobReadiness(job.id);
      return true;
    }
  }
}
