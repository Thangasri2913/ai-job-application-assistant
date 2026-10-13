import {
  APPLICATION_DOCUMENT_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  type ApplicationTimelineEvent,
} from '@job-assist/shared';
import { formatDate, formatDay } from '../../../shared/ui/format';

function describe(e: ApplicationTimelineEvent): { title: string; detail: string | null } {
  switch (e.kind) {
    case 'CREATED':
      return {
        title: `Application created · ${APPLICATION_STATUS_LABELS[e.status]}`,
        detail: `${e.resumeName} v${e.versionNumber} selected`,
      };
    case 'STATUS_CHANGED':
      return {
        title: APPLICATION_STATUS_LABELS[e.toStatus],
        detail:
          [
            e.fromStatus ? `from ${APPLICATION_STATUS_LABELS[e.fromStatus]}` : null,
            e.occurredOn ? `on ${formatDay(e.occurredOn)}` : null,
            e.note,
          ]
            .filter(Boolean)
            .join(' · ') || null,
      };
    case 'NOTE':
      return { title: e.edited ? 'Note (edited)' : 'Note', detail: e.body };
    case 'DOCUMENT_ADDED':
      return { title: `${APPLICATION_DOCUMENT_TYPE_LABELS[e.type]} added`, detail: e.name };
  }
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Status changes, notes and documents in one list, newest first. */
export function ApplicationTimeline({ events }: { events: ApplicationTimelineEvent[] }) {
  return (
    <ol
      className="relative grid gap-4 border-l border-border pl-5"
      aria-label="Application timeline"
    >
      {events.map((e) => {
        const { title, detail } = describe(e);
        return (
          <li key={`${e.kind}-${e.at}-${title}`} className="relative">
            <span
              aria-hidden
              className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary"
            />
            <p className="text-xs text-muted">
              {formatDate(e.at)} · {timeFormatter.format(new Date(e.at))}
            </p>
            <p className="text-sm font-medium">{title}</p>
            {detail ? <p className="text-sm whitespace-pre-line text-muted">{detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
