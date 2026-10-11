import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UploadRateLimit } from '../../common/decorators/upload-rate-limit.decorator.js';
import type { ResumeDetail, ResumeSummary } from '@job-assist/shared';
import {
  type AuthenticatedPrincipal,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import {
  CreateResumeFromProfileDto,
  DuplicateResumeDto,
  ListResumesQueryDto,
  UpdateResumeDto,
  UploadResumeDto,
} from './dto/resume.dto.js';
import { ResumesService, type UploadedFile as UploadedResumeFile } from './resumes.service.js';

export const ResumeId = () =>
  Param('resumeId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));

const UPLOAD_SCHEMA = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary', description: 'PDF or DOCX' },
      name: { type: 'string' },
      description: { type: 'string' },
      category: { type: 'string' },
      tags: { type: 'string', description: 'Comma-separated or JSON array' },
    },
  },
};

@ApiTags('resumes')
@ApiBearerAuth()
@Controller('resumes')
export class ResumesController {
  constructor(private readonly resumes: ResumesService) {}

  @Get()
  list(
    @CurrentUser() u: AuthenticatedPrincipal,
    @Query() query: ListResumesQueryDto,
  ): Promise<ResumeSummary[]> {
    return this.resumes.list(u.userId, query);
  }

  @Post()
  @UploadRateLimit()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_SCHEMA)
  upload(
    @CurrentUser() u: AuthenticatedPrincipal,
    @UploadedFile() file: UploadedResumeFile | undefined,
    @Body() dto: UploadResumeDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeDetail> {
    return this.resumes.upload(u.userId, file, dto, ctx);
  }

  @Post('from-profile')
  createFromProfile(
    @CurrentUser() u: AuthenticatedPrincipal,
    @Body() dto: CreateResumeFromProfileDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeDetail> {
    return this.resumes.createFromProfile(u.userId, dto, ctx);
  }

  @Get(':resumeId')
  get(@CurrentUser() u: AuthenticatedPrincipal, @ResumeId() id: string): Promise<ResumeDetail> {
    return this.resumes.get(u.userId, id);
  }

  @Patch(':resumeId')
  update(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @Body() dto: UpdateResumeDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeDetail> {
    return this.resumes.update(u.userId, id, dto, ctx);
  }

  @Delete(':resumeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.resumes.remove(u.userId, id, ctx);
  }

  @Post(':resumeId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.resumes.archive(u.userId, id, ctx);
  }

  @Post(':resumeId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.resumes.restore(u.userId, id, ctx);
  }

  @Post(':resumeId/duplicate')
  duplicate(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @Body() dto: DuplicateResumeDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ResumeDetail> {
    return this.resumes.duplicate(u.userId, id, dto, ctx);
  }

  @Post(':resumeId/default')
  @HttpCode(HttpStatus.OK)
  setDefault(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.resumes.setDefault(u.userId, id, ctx);
  }

  @Delete(':resumeId/default')
  @HttpCode(HttpStatus.OK)
  clearDefault(
    @CurrentUser() u: AuthenticatedPrincipal,
    @ResumeId() id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.resumes.clearDefault(u.userId, id, ctx);
  }
}
