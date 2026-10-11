import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { CareerProfile, ImportToProfileResult, ProfileDetails } from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { ImportToProfileDto } from './dto/import.dto.js';
import { UpdateProfileDto } from './dto/profile.dto.js';
import { ProfileService } from './profile.service.js';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @ApiOkResponse({ description: 'Full career profile: details and all sections.' })
  get(@CurrentUser() user: AuthenticatedPrincipal): Promise<CareerProfile> {
    return this.profile.getProfile(user.userId);
  }

  @Put()
  @ApiOkResponse({ description: 'Replaces personal, preference and professional fields.' })
  update(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: UpdateProfileDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ProfileDetails> {
    return this.profile.updateDetails(user.userId, dto, ctx);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Adds user-selected items from a reviewed resume. Never overwrites existing data.',
  })
  import(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: ImportToProfileDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ImportToProfileResult> {
    return this.profile.importFromResume(user.userId, dto, ctx);
  }
}
