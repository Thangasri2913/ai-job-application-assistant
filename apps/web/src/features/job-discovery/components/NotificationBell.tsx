import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNotificationAction, useNotifications } from '../hooks/useDiscovery';
import { discoveryApi } from '../services/discovery-api';
import { NotificationList } from './NotificationList';

/** Top-bar bell with the unread count and a dropdown of recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifications = useNotifications();
  const markRead = useNotificationAction((id: string) => discoveryApi.markRead(id));
  const markAll = useNotificationAction(() => discoveryApi.markAllRead());
  const unread = notifications.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 hover:bg-surface-muted"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular-nums"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => markAll.mutate(undefined)}
              >
                Mark all as read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-auto">
            <NotificationList
              items={notifications.data?.items ?? []}
              onOpen={(n) => {
                if (!n.readAt) markRead.mutate(n.id);
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
