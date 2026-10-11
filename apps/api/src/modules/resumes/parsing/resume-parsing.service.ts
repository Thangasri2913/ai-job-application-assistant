import { buffer as readAll } from 'node:stream/consumers';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { AuditAction } from '../../audit/audit-actions.js';
import { AuditService } from '../../audit/audit.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { resumeContentSchema } from '../resume-content.schema.js';
import { toJson } from '../resume.mapper.js';
import { ResumeAiStructurer } from './resume-ai-structurer.js';
import { PARSER_VERSION, parseResumeText } from './resume-parser.js';
import { TextExtractionError, TextExtractor } from './text-extractor.js';

const GENERIC_FAILURE =
  'We couldn’t process this resume. You can retry, or enter the details manually.';

/**
 * Upload → extract text → deterministic parse → (optional) AI structuring → store.
 * Each layer is stored in its own column; nothing here touches the user's profile.
 */
@Injectable()
export class ResumeParsingService {
  private readonly logger = new Logger(ResumeParsingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly extractor: TextExtractor,
    private readonly aiStructurer: ResumeAiStructurer,
    private readonly audit: AuditService,
  ) {}

  async process(versionId: string): Promise<void> {
    // Claim the job atomically so two workers never process the same version.
    const { count } = await this.prisma.resumeVersion.updateMany({
      where: { id: versionId, parseStatus: 'PENDING' },
      data: { parseStatus: 'PROCESSING', parseError: null },
    });
    if (count === 0) return;

    const version = await this.prisma.resumeVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { resume: { select: { userId: true } }, file: true },
    });
    const userId = version.resume.userId;

    try {
      if (!version.file) throw new TextExtractionError('This version has no file to parse.');
      const object = await this.storage.get(version.file.storageKey);
      const file = await readAll(object.body);
      const kind = version.file.mimeType === 'application/pdf' ? 'pdf' : 'docx';

      const extractedText = await this.extractor.extract(file, kind);
      const parsed = resumeContentSchema.parse(parseResumeText(extractedText));
      const ai = await this.aiStructurer.structure(extractedText);

      await this.prisma.resumeVersion.update({
        where: { id: versionId },
        data: {
          parseStatus: 'NEEDS_REVIEW',
          parseError: null,
          parserVersion: PARSER_VERSION,
          parsedAt: new Date(),
          extractedText,
          parsedData: toJson(parsed),
          // Stored with its status so the UI can say whether AI helped; never applied automatically.
          aiExtraction: ai ? toJson(ai) : Prisma.DbNull,
        },
      });
      await this.audit.record({
        action: AuditAction.RESUME_PARSED,
        userId,
        metadata: {
          resumeId: version.resumeId,
          versionId,
          parserVersion: PARSER_VERSION,
          aiStatus: ai?.status ?? 'DISABLED',
          counts: {
            skills: parsed.skills.length,
            experiences: parsed.experiences.length,
            educations: parsed.educations.length,
          },
        },
      });
    } catch (error) {
      const message = error instanceof TextExtractionError ? error.message : GENERIC_FAILURE;
      if (!(error instanceof TextExtractionError))
        this.logger.error({ err: error, versionId }, 'Resume parsing failed');
      await this.prisma.resumeVersion.update({
        where: { id: versionId },
        data: { parseStatus: 'FAILED', parseError: message, parsedAt: new Date() },
      });
      await this.audit.record({
        action: AuditAction.RESUME_PARSE_FAILED,
        userId,
        metadata: {
          resumeId: version.resumeId,
          versionId,
          reason: error instanceof TextExtractionError ? 'extraction' : 'internal',
        },
      });
    }
  }
}
