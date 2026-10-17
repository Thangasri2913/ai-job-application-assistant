import type {
  SmartApplicationSummary,
  SmartApplyEventItem,
  SubmissionAttemptItem,
} from '@job-assist/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SUMMARY_INCLUDE } from './smart-apply.service.js';

type SummaryRow = Prisma.SmartApplicationGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toSummary(r: SummaryRow, outstandingQuestions: number): SmartApplicationSummary {
  return {
    id: r.id,
    applicationId: r.applicationId,
    state: r.state,
    trackerStatus: r.application.status,
    job: {
      id: r.application.job.id,
      title: r.application.job.title,
      companyName: r.application.job.companyName,
      location: r.application.job.location,
      source: r.application.job.source,
    },
    matchScore: r.application.matchScore,
    outstandingQuestions,
    submissionMethod: r.submissionMethod,
    confirmation: r.confirmation,
    uncertain: r.state === 'SUBMITTING' && r.needsReconciliation,
    failureReason: r.failureReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toEvent(e: Prisma.SmartApplyEventGetPayload<object>): SmartApplyEventItem {
  return {
    id: e.id,
    fromState: e.fromState,
    toState: e.toState,
    actor: e.actor === 'USER' ? 'USER' : 'SYSTEM',
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toAttempt(a: Prisma.SubmissionAttemptGetPayload<object>): SubmissionAttemptItem {
  return {
    id: a.id,
    attemptNumber: a.attemptNumber,
    providerKey: a.providerKey,
    outcome: a.outcome,
    providerReference: a.providerReference,
    message: a.message,
    startedAt: a.startedAt.toISOString(),
    finishedAt: iso(a.finishedAt),
    nextAttemptAt: iso(a.nextAttemptAt),
  };
}
