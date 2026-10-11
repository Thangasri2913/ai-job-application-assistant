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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  APPLICATION_DOCUMENT_TYPES,
  type ApplicationDetail,
  type ApplicationDocument,
  type ApplicationNote,
  type ApplicationSummary,
  type ApplicationTimelineEvent,
} from '@job-assist/shared';
import {
  type AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type RequestContext,
  ReqContext,
} from '../../common/decorators/request-context.decorator.js';
import { UploadRateLimit } from '../../common/decorators/upload-rate-limit.decorator.js';
import { downloadHeaders } from '../../common/http/content-disposition.js';
import type { UploadedFile as UploadedDocumentFile } from '../resumes/resumes.service.js';
import { ApplicationsService } from './applications.service.js';
import {
  ChangeStatusDto,
  CreateApplicationDto,
  ListApplicationsQueryDto,
  NoteDto,
  UpdateApplicationDto,
  UploadDocumentDto,
} from './dto/application.dto.js';

/** Malformed ids are reported like missing ones (404). */
const id = (name: string) =>
  Param(name, new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND }));
const AppId = () => id('applicationId');

@ApiTags('applications')
@ApiBearerAuth()
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  create(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: CreateApplicationDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    return this.applications.create(u.userId, dto, ctx);
  }

  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationSummary[]> {
    return this.applications.list(u.userId, query);
  }

  @Get(':applicationId')
  get(@CurrentUser() u: AuthenticatedUser, @AppId() appId: string): Promise<ApplicationDetail> {
    return this.applications.get(u.userId, appId);
  }

  @Patch(':applicationId')
  update(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: UpdateApplicationDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    return this.applications.update(u.userId, appId, dto, ctx);
  }

  @Delete(':applicationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.applications.remove(u.userId, appId, ctx);
  }

  @Post(':applicationId/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: ChangeStatusDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    return this.applications.changeStatus(u.userId, appId, dto, ctx);
  }

  @Post(':applicationId/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    return this.applications.archive(u.userId, appId, ctx);
  }

  @Post(':applicationId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDetail> {
    return this.applications.restore(u.userId, appId, ctx);
  }

  @Get(':applicationId/timeline')
  timeline(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ApplicationTimelineEvent[]> {
    return this.applications.timeline(u.userId, appId);
  }

  // ── Notes ──

  @Get(':applicationId/notes')
  listNotes(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ApplicationNote[]> {
    return this.applications.listNotes(u.userId, appId);
  }

  @Post(':applicationId/notes')
  createNote(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @Body() dto: NoteDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationNote> {
    return this.applications.createNote(u.userId, appId, dto.body, ctx);
  }

  @Patch(':applicationId/notes/:noteId')
  updateNote(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('noteId') noteId: string,
    @Body() dto: NoteDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationNote> {
    return this.applications.updateNote(u.userId, appId, noteId, dto.body, ctx);
  }

  @Delete(':applicationId/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNote(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('noteId') noteId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.applications.deleteNote(u.userId, appId, noteId, ctx);
  }

  // ── Documents ──

  @Get(':applicationId/documents')
  listDocuments(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
  ): Promise<ApplicationDocument[]> {
    return this.applications.listDocuments(u.userId, appId);
  }

  @Post(':applicationId/documents')
  @UploadRateLimit()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF or DOCX' },
        type: { type: 'string', enum: [...APPLICATION_DOCUMENT_TYPES] },
        name: { type: 'string' },
      },
    },
  })
  addDocument(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body() dto: UploadDocumentDto,
    @ReqContext() ctx: RequestContext,
  ): Promise<ApplicationDocument> {
    return this.applications.addDocument(u.userId, appId, file, dto, ctx);
  }

  @Get(':applicationId/documents/:documentId/file')
  async downloadDocument(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('documentId') documentId: string,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { object, filename, mimeType } = await this.applications.downloadDocument(
      u.userId,
      appId,
      documentId,
      ctx,
    );
    res.set(downloadHeaders(filename, mimeType));
    if (object.contentLength !== undefined) res.set('Content-Length', String(object.contentLength));
    return new StreamableFile(object.body);
  }

  @Delete(':applicationId/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDocument(
    @CurrentUser() u: AuthenticatedUser,
    @AppId() appId: string,
    @id('documentId') documentId: string,
    @ReqContext() ctx: RequestContext,
  ): Promise<void> {
    return this.applications.removeDocument(u.userId, appId, documentId, ctx);
  }
}
