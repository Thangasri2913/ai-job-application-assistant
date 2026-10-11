import type { NotificationItem } from '@job-assist/shared';
import { Link } from 'react-router';
import { cn } from '../../../shared/ui/cn';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function NotificationList({
  items,
  onOpen,
}: {
  items: NotificationItem[];
  onOpen: (n: NotificationItem) => void;
}) {
  if (items.length === 0)
    return <p className="px-3 py-6 text-center text-sm text-muted">No notifications yet.</p>;
  return (
    <ul aria-label="Notifications" className="divide-y divide-border">
      {items.map((n) => {
        const body = (
          <>
            <p className={cn('text-sm', !n.readAt && 'font-semibold')}>
              {!n.readAt ? <span className="sr-only">Unread: </span> : null}
              {n.title}
            </p>
            <p className="text-sm text-muted">{n.body}</p>
            <p className="mt-0.5 text-xs text-muted">{dateTime.format(new Date(n.createdAt))}</p>
          </>
        );
        return (
          <li key={n.id} className={cn(!n.readAt && 'bg-primary-soft/40')}>
            {n.link ? (
              <Link
                to={n.link}
                onClick={() => onOpen(n)}
                className="block px-3 py-2.5 hover:bg-surface-muted"
              >
                {body}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(n)}
                className="block w-full px-3 py-2.5 text-left hover:bg-surface-muted"
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
