import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { downloadHeaders } from '../../common/http/content-disposition.js';
import { UploadRateLimit } from '../../common/decorators/upload-rate-limit.decorator.js';
import type { Response } from 'express';
import type {
  ParseStatusResponse,
  ResumeContent,
  ResumeExtractedData,
  ResumeVersionDetail,
  ResumeVersionSummary,
} from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { CreateVersionDto, UploadVersionDto } from './dto/resume.dto.js';
import { resumeContentSchema } from './resume-content.schema.js';
import { ResumeVersionsService } from './resume-versions.service.js';
import { ResumeId } from './resumes.controller.js';
import type { UploadedFile as UploadedResumeFile } from './resumes.service.js';

const VersionId = () =>
  Param('versionId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

@ApiTags('resume versions')
@ApiBearerAuth()
@Controller('resumes/:resumeId/versions')
export class ResumeVersionsController {
  constructor(private readonly versions: ResumeVersionsService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
  ): Promise<ResumeVersionSummary[]> {
    return this.versions.list(u.userId, resumeId);
  }

  @Post()
  createDraft(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @Body() dto: CreateVersionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    return this.versions.createDraft(u.userId, resumeId, dto, ctx);
  }

  @Post('upload')
  @UploadRateLimit()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' }, notes: { type: 'string' } },
    },
  })
  upload(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @UploadedFile() file: UploadedResumeFile | undefined,
    @Body() dto: UploadVersionDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    return this.versions.uploadVersion(u.userId, resumeId, file, dto, ctx);
  }

  @Get(':versionId')
  get(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
  ): Promise<ResumeVersionDetail> {
    return this.versions.get(u.userId, resumeId, versionId);
  }

  @Get(':versionId/parse-status')
  parseStatus(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
  ): Promise<ParseStatusResponse> {
    return this.versions.parseStatus(u.userId, resumeId, versionId);
  }

  @Post(':versionId/parse')
  @HttpCode(HttpStatus.ACCEPTED)
  parse(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ParseStatusResponse> {
    return this.versions.reparse(u.userId, resumeId, versionId, ctx);
  }

  @Get(':versionId/extracted-data')
  extractedData(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
  ): Promise<ResumeExtractedData> {
    return this.versions.extractedData(u.userId, resumeId, versionId);
  }

  @Patch(':versionId/extracted-data')
  @ApiBody({ description: 'Reviewed/edited ResumeContent (see @job-assist/shared).' })
  confirm(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
    @Body(new ZodValidationPipe(resumeContentSchema)) content: ResumeContent,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeExtractedData> {
    return this.versions.confirmContent(u.userId, resumeId, versionId, content, ctx);
  }

  @Post(':versionId/activate')
  @HttpCode(HttpStatus.OK)
  activate(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeVersionDetail> {
    return this.versions.activate(u.userId, resumeId, versionId, ctx);
  }

  @Get(':versionId/file')
  async download(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() resumeId: string,
    @VersionId() versionId: string,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { object, filename, mimeType } = await this.versions.download(
      u.userId,
      resumeId,
      versionId,
      ctx,
    );
    res.set(downloadHeaders(filename, mimeType));
    if (object.contentLength !== undefined) res.set('Content-Length', String(object.contentLength));
    return new StreamableFile(object.body);
  }
}
