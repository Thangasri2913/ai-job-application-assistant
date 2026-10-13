import type {
  ApplicationDetail,
  ApplicationDocument,
  ApplicationNote,
  ApplicationStatus,
  ApplicationStatusChange,
  ApplicationSummary,
  ApplicationTimelineEvent,
} from '@job-assist/shared';
import { fromDbDate } from '../../common/dates.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { allowedNextStatuses } from './application-status.js';

export const APPLICATION_LIST_INCLUDE = {
  job: { select: { id: true, title: true, companyName: true } },
  resumeVersion: {
    select: { id: true, versionNumber: true, resume: { select: { id: true, name: true } } },
  },
} as const satisfies Prisma.ApplicationInclude;

export const APPLICATION_DETAIL_INCLUDE = {
  job: {
    select: {
      id: true,
      title: true,
      companyName: true,
      location: true,
      jobUrl: true,
      status: true,
    },
  },
  resumeVersion: {
    select: {
      id: true,
      versionNumber: true,
      createdAt: true,
      fileId: true,
      resume: { select: { id: true, name: true, currentVersionId: true } },
    },
  },
  recommendedResumeVersion: {
    select: { id: true, versionNumber: true, resume: { select: { name: true } } },
  },
  statusHistory: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] },
} as const satisfies Prisma.ApplicationInclude;

type ListRow = Prisma.ApplicationGetPayload<{ include: typeof APPLICATION_LIST_INCLUDE }>;
type DetailRow = Prisma.ApplicationGetPayload<{ include: typeof APPLICATION_DETAIL_INCLUDE }>;
type HistoryRow = DetailRow['statusHistory'][number];

export function toApplicationSummary(a: ListRow | DetailRow): ApplicationSummary {
  return {
    id: a.id,
    jobId: a.job.id,
    jobTitle: a.job.title,
    companyName: a.job.companyName,
    status: a.status,
    resume: {
      resumeId: a.resumeVersion.resume.id,
      resumeName: a.resumeVersion.resume.name,
      resumeVersionId: a.resumeVersion.id,
      versionNumber: a.resumeVersion.versionNumber,
    },
    source: a.source,
    appliedAt: fromDbDate(a.appliedAt),
    archivedAt: a.archivedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** The status before the current one, from the append-only history. */
export function previousStatus(
  history: HistoryRow[],
  current: ApplicationStatus,
): ApplicationStatus | null {
  const last = history.at(-1);
  return last && last.toStatus === current ? last.fromStatus : null;
}

const firstChangeTo = (history: HistoryRow[], statuses: ApplicationStatus[]) =>
  history.find((h) => statuses.includes(h.toStatus))?.changedAt.toISOString() ?? null;

const CLOSED: ApplicationStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'NO_RESPONSE'];
const INTERVIEW_STAGES: ApplicationStatus[] = [
  'INTERVIEW',
  'TECHNICAL_INTERVIEW',
  'FINAL_INTERVIEW',
];

export function toApplicationDetail(a: DetailRow): ApplicationDetail {
  const history = a.statusHistory;
  const rec = a.recommendedResumeVersion;
  return {
    ...toApplicationSummary(a),
    applicationUrl: a.applicationUrl,
    rejectionReason: a.rejectionReason,
    rejectionCategory: a.rejectionCategory,
    offerDetails: a.offerDetails,
    job: a.job,
    resumeUsed: {
      resumeId: a.resumeVersion.resume.id,
      resumeName: a.resumeVersion.resume.name,
      resumeVersionId: a.resumeVersion.id,
      versionNumber: a.resumeVersion.versionNumber,
      versionCreatedAt: a.resumeVersion.createdAt.toISOString(),
      hasFile: a.resumeVersion.fileId !== null,
      newerVersionExists:
        a.resumeVersion.resume.currentVersionId !== null &&
        a.resumeVersion.resume.currentVersionId !== a.resumeVersion.id,
    },
    recommendedAtCreation:
      a.recommendedResumeVersionId || a.recommendedScore !== null
        ? {
            resumeVersionId: a.recommendedResumeVersionId,
            resumeName: rec?.resume.name ?? null,
            versionNumber: rec?.versionNumber ?? null,
            score: a.recommendedScore,
          }
        : null,
    matchScoreAtCreation: a.matchScore,
    allowedNextStatuses: a.archivedAt
      ? []
      : allowedNextStatuses(a.status, previousStatus(history, a.status)),
    importantDates: {
      createdAt: a.createdAt.toISOString(),
      appliedAt: fromDbDate(a.appliedAt),
      firstInterviewAt: firstChangeTo(history, INTERVIEW_STAGES),
      offerAt: firstChangeTo(history, ['OFFER']),
      closedAt: CLOSED.includes(a.status)
        ? (history
            .filter((h) => h.toStatus === a.status)
            .at(-1)
            ?.changedAt.toISOString() ?? null)
        : null,
      lastUpdatedAt: a.updatedAt.toISOString(),
    },
  };
}

export const toStatusChange = (h: HistoryRow): ApplicationStatusChange => ({
  id: h.id,
  fromStatus: h.fromStatus,
  toStatus: h.toStatus,
  changedAt: h.changedAt.toISOString(),
  occurredOn: fromDbDate(h.occurredOn),
  note: h.note,
});

export const toNote = (n: Prisma.ApplicationNoteGetPayload<object>): ApplicationNote => ({
  id: n.id,
  body: n.body,
  createdAt: n.createdAt.toISOString(),
  updatedAt: n.updatedAt.toISOString(),
});

/** Storage keys are never exposed. */
export const toDocument = (
  d: Prisma.ApplicationDocumentGetPayload<object>,
): ApplicationDocument => ({
  id: d.id,
  type: d.type,
  name: d.name,
  originalFilename: d.originalFilename,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt.toISOString(),
});

export function buildTimeline(
  a: DetailRow,
  notes: ApplicationNote[],
  documents: ApplicationDocument[],
): ApplicationTimelineEvent[] {
  const [created, ...changes] = a.statusHistory;
  const events: ApplicationTimelineEvent[] = [
    {
      kind: 'CREATED',
      at: (created?.changedAt ?? a.createdAt).toISOString(),
      status: created?.toStatus ?? a.status,
      resumeName: a.resumeVersion.resume.name,
      versionNumber: a.resumeVersion.versionNumber,
    },
    ...changes.map((h): ApplicationTimelineEvent => ({
      kind: 'STATUS_CHANGED',
      at: h.changedAt.toISOString(),
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      occurredOn: fromDbDate(h.occurredOn),
      note: h.note,
    })),
    ...notes.map((n): ApplicationTimelineEvent => ({
      kind: 'NOTE',
      at: n.createdAt,
      noteId: n.id,
      body: n.body,
      // Timestamps are set separately on create; treat sub-second differences as unedited.
      edited: Date.parse(n.updatedAt) - Date.parse(n.createdAt) > 1000,
    })),
    ...documents.map((d): ApplicationTimelineEvent => ({
      kind: 'DOCUMENT_ADDED',
      at: d.createdAt,
      documentId: d.id,
      name: d.name,
      type: d.type,
    })),
  ];
  // Newest first; the creation event always sorts before anything at the same instant.
  return events.sort(
    (x, y) =>
      y.at.localeCompare(x.at) || Number(x.kind === 'CREATED') - Number(y.kind === 'CREATED'),
  );
}
