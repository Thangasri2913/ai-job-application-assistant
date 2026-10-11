import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { NotificationItem, NotificationListResponse } from '@job-assist/shared';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthenticatedUser): Promise<NotificationListResponse> {
    return this.notifications.list(u.userId);
  }

  // Declared before ':id/read' so "read-all" is never parsed as an id.
  @Patch('read-all')
  readAll(@CurrentUser() u: AuthenticatedUser): Promise<{ updated: number }> {
    return this.notifications.markAllRead(u.userId);
  }

  @Patch(':id/read')
  read(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) id: string,
  ): Promise<NotificationItem> {
    return this.notifications.markRead(u.userId, id);
  }
}
