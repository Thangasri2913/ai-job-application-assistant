import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  NotificationItem,
  NotificationListResponse,
  NotificationType,
} from '@job-assist/shared';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type NotificationRow = Prisma.NotificationGetPayload<object>;

const toItem = (n: NotificationRow): NotificationItem => ({
  id: n.id,
  channel: n.channel,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

const LIST_LIMIT = 50;

/**
 * In-app notifications. Creation is idempotent by `dedupKey` (one per user), so a retried
 * run never notifies twice. EMAIL/PUSH are reserved channels: nothing delivers them yet.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the notification unless one with the same key exists. Returns whether it was created. */
  async notify(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    /** Ids and counts only. */
    data?: Record<string, string | number>;
    dedupKey: string;
  }): Promise<boolean> {
    const { count } = await this.prisma.notification.createMany({
      data: [
        {
          userId: input.userId,
          channel: 'IN_APP',
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          data: input.data ?? undefined,
          dedupKey: input.dedupKey,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async list(userId: string): Promise<NotificationListResponse> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, channel: 'IN_APP' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: LIST_LIMIT,
      }),
      this.prisma.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } }),
    ]);
    return { items: rows.map(toItem), unreadCount };
  }

  async markRead(userId: string, id: string): Promise<NotificationItem> {
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing)
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Notification not found.');
    if (existing.readAt) return toItem(existing);
    return toItem(
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } }),
    );
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
