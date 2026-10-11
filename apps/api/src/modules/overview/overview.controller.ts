import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { DashboardSummary, ProfileCompletion } from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import { OverviewService } from './overview.service.js';

@ApiTags('overview')
@ApiBearerAuth()
@Controller()
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get('profile/completion')
  @ApiOkResponse({
    description: 'Weighted checklist; see docs/ARCHITECTURE.md § Profile completion.',
  })
  completion(@CurrentUser() u: AuthenticatedPrincipal): Promise<ProfileCompletion> {
    return this.overview.profileCompletion(u.userId);
  }

  @Get('dashboard/summary')
  dashboard(@CurrentUser() u: AuthenticatedPrincipal): Promise<DashboardSummary> {
    return this.overview.dashboard(u.userId);
  }
}
