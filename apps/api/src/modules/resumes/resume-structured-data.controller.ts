import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { ParseStatusResponse, ResumeContent, ResumeExtractedData } from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { resumeContentSchema } from './resume-content.schema.js';
import { ResumeVersionsService } from './resume-versions.service.js';
import { ResumeId } from './resumes.controller.js';

/**
 * Resume-level parsing and structured-data endpoints. They act on the resume's
 * *working version*: the open draft if there is one, otherwise the current version.
 * Version-specific equivalents live under /resumes/:id/versions/:versionId.
 */
@ApiTags('resumes')
@ApiBearerAuth()
@Controller('resumes/:resumeId')
export class ResumeStructuredDataController {
  constructor(private readonly versions: ResumeVersionsService) {}

  @Post('parse')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOkResponse({ description: 'Re-runs parsing on the open draft upload.' })
  parse(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ParseStatusResponse> {
    return this.versions.resumeReparse(u.userId, resumeId, ctx);
  }

  @Get('parsing-status')
  parsingStatus(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
  ): Promise<ParseStatusResponse> {
    return this.versions.resumeParseStatus(u.userId, resumeId);
  }

  @Get('structured-data')
  structuredData(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
  ): Promise<ResumeExtractedData> {
    return this.versions.resumeStructuredData(u.userId, resumeId);
  }

  @Patch('structured-data')
  @ApiBody({
    description:
      'ResumeContent. Saved to the open draft; if there is none, a new draft is created — frozen versions are never changed.',
  })
  updateStructuredData(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @Body(new ZodValidationPipe(resumeContentSchema)) content: ResumeContent,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeExtractedData> {
    return this.versions.updateResumeStructuredData(u.userId, resumeId, content, ctx);
  }
}
